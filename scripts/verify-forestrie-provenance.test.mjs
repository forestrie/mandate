// Unit tests for the FOR-366 provenance-identity control. Fully offline:
// registry/attestation responses are served from fixtures via an injected
// fetch. Run with `node --test scripts/`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
	REGISTRY,
	integrityToHex,
	parseForestrieLockEntries,
	verifyLockfile,
	verifyPackage
} from './verify-forestrie-provenance.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name) => path.join(here, 'fixtures', name);

const REAL_INTEGRITY =
	'sha512-cIgfvJA8c1v4vuwOIN0q/7mGQvlDyYk3LE/hZhPjPOLTD1x9uuowYmxLwHR0rw/GRrqNNcbPJlFoDJyxHdTn6Q==';

/** Build a fetch mock from a { urlSubstring: response } routing table. */
function mockFetch(routes) {
	return async (url) => {
		for (const [needle, res] of Object.entries(routes)) {
			if (url.includes(needle)) {
				if (res.status && res.status !== 200) return { ok: false, status: res.status };
				return { ok: true, status: 200, json: async () => res.body };
			}
		}
		return { ok: false, status: 404 };
	};
}

test('parses the real lockfile shape: registry entry + importer refs', async () => {
	const lock = await readFile(path.join(here, '..', 'pnpm-lock.yaml'), 'utf8');
	const { entries, importerRefs } = parseForestrieLockEntries(lock);
	const cose = entries.find((e) => e.name === '@forestrie/delegation-cose');
	assert.ok(cose, 'delegation-cose found in packages section');
	assert.equal(cose.version, '0.1.3');
	assert.match(cose.integrity, /^sha512-/);
	// workspace-linked @forestrie packages (ui-e2e-kit) must NOT be reported
	assert.ok(importerRefs.every((r) => !r.version.startsWith('link:')));
	assert.ok(importerRefs.some((r) => r.name === '@forestrie/delegation-cose'));
	assert.ok(!importerRefs.some((r) => r.name === '@forestrie/mandate-ui-e2e-kit'));
});

test('FAILS (non-zero) when no attestation exists for the resolved version', async () => {
	const lock = await readFile(fixture('fabricated-lockfile.yaml'), 'utf8');
	const fabricatedIntegrity = lock.match(/integrity: (sha512-[^,}]+)/)[1];
	const fetchFn = mockFetch({
		// registry metadata exists and matches the lockfile...
		'/@forestrie%2Fdelegation-cose/0.0.9': { body: { dist: { integrity: fabricatedIntegrity } } },
		// ...but the attestations endpoint has nothing for it (M1: manual publish)
		'/-/npm/v1/attestations/': { status: 404 }
	});
	const { ok, report } = await verifyLockfile(lock, { fetchFn });
	assert.equal(ok, false, 'verification must fail when no attestation exists');
	const flat = report.join('\n');
	assert.match(flat, /FAIL @forestrie\/delegation-cose@0\.0\.9/);
	assert.match(flat, /no provenance attestation exists/);
});

test('PASSES on the real delegation-cose@0.1.3 attestation (offline fixture)', async () => {
	const attestations = JSON.parse(
		await readFile(fixture('delegation-cose-0.1.3-attestations.json'), 'utf8')
	);
	const fetchFn = mockFetch({
		'/@forestrie%2Fdelegation-cose/0.1.3': { body: { dist: { integrity: REAL_INTEGRITY } } },
		'/-/npm/v1/attestations/': { body: attestations }
	});
	const entry = {
		name: '@forestrie/delegation-cose',
		version: '0.1.3',
		integrity: REAL_INTEGRITY,
		tarball: null,
		rawKey: '@forestrie/delegation-cose@0.1.3'
	};
	const failures = await verifyPackage(entry, { fetchFn });
	assert.deepEqual(failures, []);
});

test('FAILS when the attestation identity is a different repo/workflow', async () => {
	const attestations = JSON.parse(
		await readFile(fixture('delegation-cose-0.1.3-attestations.json'), 'utf8')
	);
	// Tamper with the signed statement: claim the same package was built by
	// a different repository's workflow. Both the predicate check and the
	// certificate-SAN check must flag it (the cert still names canopy).
	const slsa = attestations.attestations.find(
		(a) => a.predicateType === 'https://slsa.dev/provenance/v1'
	);
	const statement = JSON.parse(Buffer.from(slsa.bundle.dsseEnvelope.payload, 'base64').toString());
	statement.predicate.buildDefinition.externalParameters.workflow.repository =
		'https://github.com/attacker/evil';
	slsa.bundle.dsseEnvelope.payload = Buffer.from(JSON.stringify(statement)).toString('base64');

	const fetchFn = mockFetch({
		'/@forestrie%2Fdelegation-cose/0.1.3': { body: { dist: { integrity: REAL_INTEGRITY } } },
		'/-/npm/v1/attestations/': { body: attestations }
	});
	const failures = await verifyPackage(
		{
			name: '@forestrie/delegation-cose',
			version: '0.1.3',
			integrity: REAL_INTEGRITY,
			tarball: null,
			rawKey: '@forestrie/delegation-cose@0.1.3'
		},
		{ fetchFn }
	);
	assert.ok(
		failures.some((f) => f.includes('predicate workflow repository is')),
		`predicate identity mismatch reported: ${failures.join(' | ')}`
	);
});

test('FAILS when the package resolves from a non-npmjs tarball', async () => {
	const failures = await verifyPackage(
		{
			name: '@forestrie/delegation-cose',
			version: '0.1.0',
			integrity: REAL_INTEGRITY,
			tarball: 'https://npm.pkg.github.com/download/@forestrie/delegation-cose/0.1.0/sha512-abc',
			rawKey: '@forestrie/delegation-cose@0.1.0'
		},
		{ fetchFn: mockFetch({}) }
	);
	assert.ok(failures.some((f) => f.includes('non-npmjs tarball')));
});

test('FAILS when the lockfile integrity differs from the registry artifact', async () => {
	const fetchFn = mockFetch({
		'/@forestrie%2Fdelegation-cose/0.1.3': {
			body: { dist: { integrity: 'sha512-DIFFERENTDIFFERENTDIFFERENT==' } }
		}
	});
	const failures = await verifyPackage(
		{
			name: '@forestrie/delegation-cose',
			version: '0.1.3',
			integrity: REAL_INTEGRITY,
			tarball: null,
			rawKey: '@forestrie/delegation-cose@0.1.3'
		},
		{ fetchFn }
	);
	assert.ok(failures.some((f) => f.includes('does not match')));
});

test('FAILS for a @forestrie package with no registered expected identity', async () => {
	const integrity = REAL_INTEGRITY;
	const attestations = JSON.parse(
		await readFile(fixture('delegation-cose-0.1.3-attestations.json'), 'utf8')
	);
	const fetchFn = mockFetch({
		'/@forestrie%2Funknown-pkg/1.0.0': { body: { dist: { integrity } } },
		'/-/npm/v1/attestations/': { body: attestations }
	});
	const failures = await verifyPackage(
		{
			name: '@forestrie/unknown-pkg',
			version: '1.0.0',
			integrity,
			tarball: null,
			rawKey: '@forestrie/unknown-pkg@1.0.0'
		},
		{ fetchFn }
	);
	assert.ok(failures.some((f) => f.includes('no expected publish identity')));
});

test('integrityToHex converts sha512 integrity to the attestation digest form', () => {
	assert.equal(
		integrityToHex(REAL_INTEGRITY),
		'70881fbc903c735bf8beec0e20dd2affb98642f943c989372c4fe16613e33ce2d30f5c7dbaea30626c4bc07474af0fc646ba8d35c6cf2651680c9cb11dd4e7e9'
	);
	assert.equal(REGISTRY, 'https://registry.npmjs.org');
});
