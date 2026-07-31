#!/usr/bin/env node
// Verify provenance identity for every registry-installed @forestrie/*
// dependency in pnpm-lock.yaml (FOR-366, plan-2607-13 W5 / finding M1).
//
// This is the replacement control for the deleted FOR-119 exact-pin
// mechanism. For each @forestrie/* entry it asserts:
//
//   1. REGISTRY  — the package resolves from registry.npmjs.org (no other
//      registry, no ad-hoc tarball URL) and the lockfile integrity hash
//      equals the npmjs dist.integrity for that exact version, i.e. the
//      locked bytes ARE the public-registry bytes.
//   2. ATTESTED  — a provenance attestation exists for the exact resolved
//      version (GET /-/npm/v1/attestations/<pkg>@<version> returns a SLSA
//      v1 provenance attestation). "No attestation" is a FAILURE: a
//      version published outside trusted publishing has no attestation.
//   3. IDENTITY  — the attestation identifies the expected source:
//        a. the signed SLSA predicate's build workflow is
//           forestrie/<repo> + the known publish workflow path, and
//        b. the sigstore Fulcio certificate's SAN (the OIDC identity the
//           signature was actually issued to — not attacker-writable
//           metadata) names the same repo + workflow path, and
//        c. the attestation subject digest equals the lockfile integrity
//           hash, binding the identity to the exact locked tarball bytes.
//
// The identity check is what detects a compromised maintainer account
// publishing outside trusted publishing: such a publish either has no
// attestation (2) or an attestation signed for a different workflow
// identity (3b).
//
// Note: this control checks provenance *identity*; it does not perform
// full sigstore bundle verification (DSSE signature + cert chain + tlog
// inclusion). npm clients verify the registry signature on install; the
// certificate SAN read here is the identity Fulcio bound into the cert.
//
// Usage: node scripts/verify-forestrie-provenance.mjs [--lockfile <path>]
// Exits non-zero with a per-package report on any failure.

import { readFile } from 'node:fs/promises';
import { X509Certificate } from 'node:crypto';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const REGISTRY = 'https://registry.npmjs.org';
export const SLSA_PREDICATE_TYPE = 'https://slsa.dev/provenance/v1';

// Expected publish identity for each @forestrie package mandate may install
// from the registry. Extend this map when a new @forestrie dependency is
// added; an unlisted package is a FAILURE, not a skip.
export const EXPECTED_IDENTITIES = {
	'@forestrie/delegation-cose': {
		repository: 'forestrie/canopy',
		workflowPath: '.github/workflows/publish-delegation-cose.yml'
	},
	// Univocity deployment core — manifest verify, CREATE2 planning and the
	// Safe propose/execute client for the /onboard inline deploy branch
	// (plan-2607-47, FOR-512/513).
	'@forestrie/deploy-core': {
		repository: 'forestrie/univocity-tools',
		workflowPath: '.github/workflows/publish-deploy-core.yml'
	},
	// The platform CBOR/COSE codec (FOR-484: replaces the banned cbor-x).
	'@forestrie/encoding': {
		repository: 'forestrie/canopy',
		workflowPath: '.github/workflows/publish-encoding.yml'
	},
	// mandate's own kits (FOR-360 / FOR-361): mandate does not install these
	// from the registry today (ui-e2e-kit is a workspace link), but other
	// repos porting this script — and any future registry self-consumption —
	// need the expected publish identity on record.
	'@forestrie/mandate-register': {
		repository: 'forestrie/mandate',
		workflowPath: '.github/workflows/publish-mandate-register.yml'
	},
	'@forestrie/mandate-ui-e2e-kit': {
		repository: 'forestrie/mandate',
		workflowPath: '.github/workflows/publish-ui-e2e-kit.yml'
	}
};

/**
 * Extract every @forestrie/* entry from a pnpm-lock.yaml (v9) text.
 *
 * Registry-installed packages appear under the top-level `packages:`
 * section as `'@forestrie/<name>@<version>':` keys with a `resolution:`
 * line. Workspace links (`version: link:...`) do not appear there and are
 * intentionally out of scope. As a parser-sanity cross-check, importer
 * dependency entries are also scanned: every non-link @forestrie importer
 * version must be covered by a packages-section entry.
 *
 * @returns {{ entries: Array<{name: string, version: string, integrity: string|null, tarball: string|null, rawKey: string}>, importerRefs: Array<{name: string, version: string}> }}
 */
export function parseForestrieLockEntries(lockfileText) {
	const lines = lockfileText.split('\n');
	const entries = [];
	const importerRefs = [];

	let section = null; // 'importers' | 'packages' | other
	let pending = null; // packages-section entry awaiting its resolution line
	let importerDep = null; // importer dep name awaiting its version line

	const flush = () => {
		if (pending) entries.push(pending);
		pending = null;
	};

	for (const line of lines) {
		const top = line.match(/^(\w[\w-]*):/);
		if (top) {
			flush();
			section = top[1];
			continue;
		}

		if (section === 'packages') {
			const key = line.match(/^ {2}'(@forestrie\/([^@']+)@([^']+))':\s*$/);
			if (key) {
				flush();
				pending = {
					name: `@forestrie/${key[2]}`,
					version: key[3],
					integrity: null,
					tarball: null,
					rawKey: key[1]
				};
				continue;
			}
			if (/^ {2}\S/.test(line)) flush(); // next (non-forestrie) package key
			if (pending) {
				const res = line.match(/^ {4}resolution:\s*\{(.*)\}\s*$/);
				if (res) {
					const integrity = res[1].match(/integrity:\s*([^,}\s]+)/);
					const tarball = res[1].match(/tarball:\s*([^,}\s]+)/);
					pending.integrity = integrity ? integrity[1] : null;
					pending.tarball = tarball ? tarball[1] : null;
				}
			}
		} else if (section === 'importers') {
			const dep = line.match(/^ {6}'(@forestrie\/[^']+)':\s*$/);
			if (dep) {
				importerDep = dep[1];
				continue;
			}
			if (importerDep) {
				const ver = line.match(/^ {8}version:\s*(\S+)/);
				if (ver) {
					if (!ver[1].startsWith('link:')) {
						// strip peer-dep suffix e.g. 0.1.3(foo@1.2.3)
						importerRefs.push({ name: importerDep, version: ver[1].replace(/\(.*$/, '') });
					}
					importerDep = null;
				} else if (!/^ {8}/.test(line)) {
					importerDep = null;
				}
			}
		}
	}
	flush();
	return { entries, importerRefs };
}

/** sha512 integrity string (sha512-<base64>) -> lowercase hex digest. */
export function integrityToHex(integrity) {
	const [algo, b64] = integrity.split('-', 2);
	if (algo !== 'sha512' || !b64) return null;
	return Buffer.from(b64, 'base64').toString('hex');
}

function certificateSanUri(rawBytesB64) {
	const der = Buffer.from(rawBytesB64, 'base64');
	const b64 = der
		.toString('base64')
		.match(/.{1,64}/g)
		.join('\n');
	const pem = `-----BEGIN CERTIFICATE-----\n${b64}\n-----END CERTIFICATE-----\n`;
	const cert = new X509Certificate(pem);
	const san = cert.subjectAltName ?? '';
	const uri = san.match(/URI:(\S+)/);
	return uri ? uri[1] : null;
}

/**
 * Verify one lockfile entry. Returns an array of failure strings (empty =
 * pass). `fetchFn` is injectable for tests.
 */
export async function verifyPackage(entry, { fetchFn = fetch } = {}) {
	const failures = [];
	const spec = `${entry.name}@${entry.version}`;

	// -- 1. registry resolution ------------------------------------------
	if (!/^\d+\.\d+\.\d+(-[\w.-]+)?$/.test(entry.version)) {
		failures.push(
			`resolves from a non-registry specifier ('${entry.rawKey}'); ` +
				`expected an exact semver resolved from ${REGISTRY}`
		);
		return failures; // nothing further is meaningful
	}
	if (entry.tarball && !entry.tarball.startsWith(`${REGISTRY}/`)) {
		failures.push(`resolves from non-npmjs tarball URL: ${entry.tarball}`);
		return failures;
	}
	if (!entry.integrity) {
		failures.push('lockfile entry has no integrity hash');
		return failures;
	}

	const encodedName = entry.name.replace('/', '%2F');
	const metaRes = await fetchFn(`${REGISTRY}/${encodedName}/${entry.version}`);
	if (!metaRes.ok) {
		failures.push(`version not found on ${REGISTRY} (HTTP ${metaRes.status})`);
		return failures;
	}
	const meta = await metaRes.json();
	const distIntegrity = meta?.dist?.integrity;
	if (distIntegrity !== entry.integrity) {
		failures.push(
			`lockfile integrity does not match ${REGISTRY} dist.integrity — the locked ` +
				`tarball is NOT the public-registry artifact ` +
				`(lockfile: ${entry.integrity}, registry: ${distIntegrity})`
		);
		return failures;
	}

	// -- 2. attestation exists -------------------------------------------
	const attRes = await fetchFn(`${REGISTRY}/-/npm/v1/attestations/${encodedName}@${entry.version}`);
	if (!attRes.ok) {
		failures.push(
			`no provenance attestation exists for ${spec} (HTTP ${attRes.status}) — ` +
				'this version was published outside trusted publishing'
		);
		return failures;
	}
	const attBody = await attRes.json();
	const attestations = attBody?.attestations ?? [];
	const slsa = attestations.find((a) => a.predicateType === SLSA_PREDICATE_TYPE);
	if (!slsa) {
		failures.push(
			`attestation response carries no ${SLSA_PREDICATE_TYPE} provenance attestation ` +
				`(found: ${attestations.map((a) => a.predicateType).join(', ') || 'none'})`
		);
		return failures;
	}

	// -- 3. identity -------------------------------------------------------
	const expected = EXPECTED_IDENTITIES[entry.name];
	if (!expected) {
		failures.push(
			`no expected publish identity is registered for ${entry.name} — ` +
				'add it to EXPECTED_IDENTITIES in scripts/verify-forestrie-provenance.mjs'
		);
		return failures;
	}
	const expectedRepoUrl = `https://github.com/${expected.repository}`;
	const expectedSanPrefix = `${expectedRepoUrl}/${expected.workflowPath}@`;

	let statement;
	try {
		statement = JSON.parse(Buffer.from(slsa.bundle.dsseEnvelope.payload, 'base64').toString());
	} catch {
		failures.push('could not decode the SLSA attestation DSSE payload');
		return failures;
	}

	// 3c. subject digest binds the attestation to the locked bytes
	const subject = (statement.subject ?? []).find((s) => s?.digest?.sha512);
	const lockHex = integrityToHex(entry.integrity);
	if (!subject || subject.digest.sha512 !== lockHex) {
		failures.push(
			`attestation subject sha512 does not match the lockfile integrity ` +
				`(subject: ${subject?.digest?.sha512 ?? 'missing'}, lockfile: ${lockHex})`
		);
	}
	const expectedPurl = `pkg:npm/%40forestrie/${entry.name.split('/')[1]}@${entry.version}`;
	if (subject && subject.name !== expectedPurl) {
		failures.push(`attestation subject is ${subject.name}, expected ${expectedPurl}`);
	}

	// 3a. signed predicate: build workflow repo + path
	const wf = statement.predicate?.buildDefinition?.externalParameters?.workflow;
	if (!wf) {
		failures.push('SLSA predicate has no buildDefinition.externalParameters.workflow');
	} else {
		if (wf.repository !== expectedRepoUrl) {
			failures.push(
				`predicate workflow repository is ${wf.repository}, expected ${expectedRepoUrl}`
			);
		}
		if (wf.path !== expected.workflowPath) {
			failures.push(`predicate workflow path is ${wf.path}, expected ${expected.workflowPath}`);
		}
	}

	// 3b. Fulcio certificate SAN: the identity the signature was issued to
	const certRaw = slsa.bundle.verificationMaterial?.certificate?.rawBytes;
	if (!certRaw) {
		failures.push('SLSA attestation bundle carries no signing certificate');
	} else {
		let sanUri = null;
		try {
			sanUri = certificateSanUri(certRaw);
		} catch (err) {
			failures.push(`could not parse the signing certificate: ${err.message}`);
		}
		// SAN absence is a FAILURE (P6, plan-2607-14): a cert without a SAN URI
		// would otherwise skip the strongest identity leg and pass on the
		// attacker-writable predicate alone.
		if (sanUri === null || !sanUri.startsWith(expectedSanPrefix)) {
			failures.push(
				`signing certificate identity is ${sanUri ?? 'missing'}, ` +
					`expected ${expectedSanPrefix}<ref> — the attestation was signed by a ` +
					'different repository or workflow'
			);
		}
	}

	return failures;
}

/**
 * Verify every @forestrie/* entry in a lockfile text.
 * @returns {{ ok: boolean, report: string[] }}
 */
export async function verifyLockfile(lockfileText, { fetchFn = fetch } = {}) {
	const { entries, importerRefs } = parseForestrieLockEntries(lockfileText);
	const report = [];
	let ok = true;

	// Parser sanity: every registry-installed importer ref must be covered.
	const covered = new Set(entries.map((e) => `${e.name}@${e.version}`));
	for (const ref of importerRefs) {
		if (!covered.has(`${ref.name}@${ref.version}`)) {
			ok = false;
			report.push(
				`FAIL ${ref.name}@${ref.version}: referenced by an importer but not found ` +
					'in the lockfile packages section — unrecognised resolution mode'
			);
		}
	}

	if (entries.length === 0 && importerRefs.length === 0) {
		report.push('no registry-installed @forestrie/* dependencies in the lockfile');
		return { ok, report };
	}

	for (const entry of entries) {
		const failures = await verifyPackage(entry, { fetchFn });
		if (failures.length === 0) {
			report.push(`PASS ${entry.name}@${entry.version}`);
		} else {
			ok = false;
			report.push(`FAIL ${entry.name}@${entry.version}:`);
			for (const f of failures) report.push(`  - ${f}`);
		}
	}
	return { ok, report };
}

async function main() {
	const args = process.argv.slice(2);
	const flagIdx = args.indexOf('--lockfile');
	const lockfilePath =
		flagIdx !== -1 ? args[flagIdx + 1] : path.join(process.cwd(), 'pnpm-lock.yaml');
	const text = await readFile(lockfilePath, 'utf8');
	const { ok, report } = await verifyLockfile(text);
	console.log(`@forestrie dependency provenance (${lockfilePath}):`);
	for (const line of report) console.log(`  ${line}`);
	if (!ok) {
		console.error('\nprovenance verification FAILED');
		process.exit(1);
	}
	console.log('\nprovenance verification passed');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	main().catch((err) => {
		console.error(`provenance verification errored: ${err.stack ?? err}`);
		process.exit(1);
	});
}
