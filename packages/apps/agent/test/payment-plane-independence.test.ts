import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { handleDelegationRequired } from '../src/handle-delegation-required.js';
import { MemorySeenStore } from '../src/dedup/seen-store.js';
import { KeyRegistry } from '../src/signer/key-registry.js';
import type { JwksResolver } from '../src/webhook/jwks-resolver.js';
import {
	assertCertificateVerifies,
	buildDelegationRequiredEvent,
	generateDelegatedPublicKeyCbor,
	generateTestKs256Root,
	generateWebhookSigningKeyPair,
	signWebhookBody,
	TEST_LOG_ID
} from './test-helpers.js';

/**
 * ARC-0022 invariant I7 — payment/authority independence.
 *
 * "Payment state is never an input to sealing verification." FOR-428 adds a
 * payment plane to mandate for the first time, so this is the test that keeps
 * the two planes apart. Payment gates **issuance** of a paid grant and nothing
 * else.
 *
 * Two halves, deliberately:
 *
 *  - **Structural.** Scan the agent's source. No module outside the payment
 *    plane may so much as mention payment. This catches the mistake at the
 *    moment it is written, including in code paths no test exercises.
 *  - **Behavioural.** The delegation/sealing path must work with zero payment
 *    configuration present. If payment state ever became an input, an operator
 *    who sells no grants could not seal.
 */

const SRC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src');

/**
 * The payment plane. Everything else in `src/` is a verification, signing or
 * sealing path and must stay payment-free.
 *
 * Keep this list SHORT. Adding an entry is how the invariant gets hollowed out,
 * so a new entry needs a reason that survives review.
 */
const PAYMENT_PLANE = [
	'grants/handle-grant-request.ts', // the paid issuance route itself
	'grants/grant-request.ts', // its request/issuer types
	'env.ts', // declares the X402_* bindings
	'index.ts' // the router that mounts POST /grants
];

/**
 * Tokens that betray a payment dependency.
 *
 * Substring matches, not `\b`-anchored ones: `paymentSettled` and `x402Config`
 * are exactly the identifiers a violation would be written as, and word
 * boundaries would let both through.
 */
const PAYMENT_TOKENS = [
	/x402/i,
	/payment/i,
	/payto/i,
	/settle/i,
	/facilitator/i,
	/priceatomic/i,
	/paywall/i,
	/arrears/i,
	/invoice/i,
	/billing/i
];

async function listSourceFiles(dir: string, prefix = ''): Promise<string[]> {
	const entries = await readdir(dir, { withFileTypes: true });
	const files: string[] = [];
	for (const entry of entries) {
		const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
		if (entry.isDirectory()) {
			files.push(...(await listSourceFiles(path.join(dir, entry.name), rel)));
		} else if (entry.name.endsWith('.ts')) {
			files.push(rel);
		}
	}
	return files.sort();
}

describe('I7 (structural): no verify path consults payment state', () => {
	it('finds the agent source', async () => {
		const files = await listSourceFiles(SRC_DIR);
		expect(files.length).toBeGreaterThan(10);
		// The verification and sealing modules this invariant is actually about.
		expect(files).toContain('webhook/verify-signature.ts');
		expect(files).toContain('delegation/validate-certificate.ts');
		expect(files).toContain('handle-delegation-required.ts');
	});

	it('every payment-plane file listed above actually exists', async () => {
		const files = await listSourceFiles(SRC_DIR);
		for (const allowed of PAYMENT_PLANE) {
			expect(files, `stale PAYMENT_PLANE entry: ${allowed}`).toContain(allowed);
		}
	});

	it('no module outside the payment plane mentions payment', async () => {
		const files = await listSourceFiles(SRC_DIR);
		const offenders: string[] = [];

		for (const file of files) {
			if (PAYMENT_PLANE.includes(file)) continue;
			const source = await readFile(path.join(SRC_DIR, file), 'utf8');
			for (const token of PAYMENT_TOKENS) {
				if (token.test(source)) {
					offenders.push(`${file} matches ${token}`);
				}
			}
		}

		expect(
			offenders,
			'ARC-0022 I7: payment state must never reach a verification or sealing path. ' +
				'If this is a genuine payment-plane module, add it to PAYMENT_PLANE — ' +
				'otherwise remove the dependency.'
		).toEqual([]);
	});

	it('no verification module imports the x402 library', async () => {
		const files = await listSourceFiles(SRC_DIR);
		for (const file of files) {
			if (PAYMENT_PLANE.includes(file)) continue;
			const source = await readFile(path.join(SRC_DIR, file), 'utf8');
			expect(source, `${file} imports @mandate/x402`).not.toContain('@mandate/x402');
			expect(source, `${file} imports the grants plane`).not.toMatch(/from\s+'\.{1,2}\/grants\//);
		}
	});

	it('the grants route does not reach into the signing or verification planes', async () => {
		// The converse direction: the payment plane must not acquire sealing
		// authority either. It gets settlement config and an issuer seam, nothing
		// more.
		const source = await readFile(path.join(SRC_DIR, 'grants/handle-grant-request.ts'), 'utf8');
		expect(source).not.toContain('key-registry');
		expect(source).not.toContain('resolve-signer');
		expect(source).not.toContain('verify-signature');
		expect(source).not.toContain('validate-certificate');
		expect(source).not.toContain('COORDINATOR_');
	});
});

/* ---------- Behavioural half ---------- */

const COORDINATOR_ORIGIN = 'http://coordinator.test';
const NOW = 1_700_000_000;

function createJwksResolver(
	publicJwk: Awaited<ReturnType<typeof generateWebhookSigningKeyPair>>['publicJwk']
): JwksResolver {
	return {
		async resolveVerificationKeys() {
			return [publicJwk];
		},
		invalidate() {}
	};
}

describe('I7 (behavioural): sealing works with no payment configuration at all', () => {
	it('verifies, signs and submits a delegation certificate with zero payment state', async () => {
		const root = await generateTestKs256Root();
		const delegatedPublicKeyCbor = await generateDelegatedPublicKeyCbor();
		const { privateKey, publicJwk } = await generateWebhookSigningKeyPair();

		const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input);
			if (url.endsWith('/api/delegations/certificate')) {
				const body = JSON.parse(String(init?.body)) as { certificate: string };
				await assertCertificateVerifies(body.certificate, root.rootSignerAddressBytes);
				return new Response(JSON.stringify({ ok: true, certificateKey: 'ck' }), { status: 200 });
			}
			// Any facilitator call from the sealing path would land here and fail
			// the test rather than being silently tolerated.
			throw new Error(`unexpected fetch from the sealing path: ${url}`);
		});

		const event = buildDelegationRequiredEvent({
			root,
			delegatedPublicKeyCbor,
			requestKey: 'i7-request-key'
		});
		const eventBody = JSON.stringify(event);
		const timestamp = String(NOW);
		const signature = await signWebhookBody(privateKey, timestamp, eventBody);

		// Note what is NOT in these deps: no payment env, no facilitator, no
		// payTo. AgentDeps has no field that could carry one.
		const response = await handleDelegationRequired(
			new Request('http://agent.test/webhooks/delegation-required', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'X-Forestrie-Webhook-Timestamp': timestamp,
					'X-Forestrie-Webhook-Signature': signature
				},
				body: eventBody
			}),
			{
				jwksResolver: createJwksResolver(publicJwk),
				keyRegistry: new KeyRegistry(
					JSON.stringify({
						[TEST_LOG_ID]: {
							alg: 'KS256',
							rootSignerAddress: root.rootSignerAddress,
							kind: 'local',
							privateKeyHex: root.privateKeyHex
						}
					})
				),
				seenStore: new MemorySeenStore(),
				coordinatorUpstreamUrl: COORDINATOR_ORIGIN,
				coordinatorAppToken: 'test-token',
				mandateSignerToken: 'test-signer-token',
				fetchImpl: fetchImpl as unknown as typeof fetch,
				nowSeconds: NOW
			}
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ ok: true });
		// One call, to the coordinator. Nothing asked a facilitator anything.
		expect(fetchImpl).toHaveBeenCalledTimes(1);
	});

	it('AgentDeps carries no payment field', async () => {
		const source = await readFile(path.join(SRC_DIR, 'handle-delegation-required.ts'), 'utf8');
		const deps = source.slice(
			source.indexOf('export interface AgentDeps'),
			source.indexOf('export interface DelegationRequiredResult')
		);
		expect(deps.length).toBeGreaterThan(0);
		for (const token of PAYMENT_TOKENS) {
			expect(deps, `AgentDeps matches ${token}`).not.toMatch(token);
		}
	});
});
