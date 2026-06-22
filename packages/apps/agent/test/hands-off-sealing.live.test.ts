import { randomBytes } from 'node:crypto';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { handleDelegationRequired } from '../src/handle-delegation-required.js';
import { MemorySeenStore } from '../src/dedup/seen-store.js';
import { KeyRegistry } from '../src/signer/key-registry.js';
import type { JwksResolver } from '../src/webhook/jwks-resolver.js';
import { handleSign } from '../../signer/src/handle-sign.js';
import type { Env as SignerEnv } from '../../signer/src/env.js';
import {
	assertCertificateVerifies,
	buildDelegationRequiredEvent,
	generateDelegatedPublicKeyCbor,
	generateWebhookSigningKeyPair,
	signWebhookBody,
	TEST_LOG_ID
} from './test-helpers.js';

/**
 * Agent-level hands-off Mode C sealing (FOR-113).
 *
 * Webhook → agent → in-process @mandate/signer → live Privy owned-wallet sign
 * → verify-before-submit → captured coordinator material submit.
 *
 *   doppler run --project mandate-forestrie --config dev -- \
 *     pnpm --filter @mandate/agent test:live:hands-off
 */

const APP_ID = process.env.PRIVY_APP_ID;
const APP_SECRET = process.env.PRIVY_APP_SECRET;
const WALLET_ID = process.env.PRIVY_WALLET_ID;
const AUTH_KEY = process.env.PRIVY_AUTHORIZATION_KEY;
const API_BASE = (process.env.PRIVY_API_BASE ?? 'https://api.privy.io').replace(/\/$/, '');
const LIVE = Boolean(APP_ID && APP_SECRET && WALLET_ID && AUTH_KEY);

const COORDINATOR_ORIGIN = 'http://coordinator.test';
const SIGNER_URL = 'http://signer.local/v1/sign';
const SIGNER_TOKEN = 'live-hands-off-signer-token';
const AGENT_TOKEN = 'live-hands-off-agent-token';
const NOW = Math.floor(Date.now() / 1000);
const TIMEOUT_MS = 90_000;

async function resolveWalletAddress(): Promise<string> {
	const provided = process.env.PRIVY_WALLET_ADDRESS?.trim();
	if (provided) return provided;
	const basicAuth = Buffer.from(`${APP_ID}:${APP_SECRET}`).toString('base64');
	const response = await fetch(`${API_BASE}/v1/wallets/${WALLET_ID}`, {
		headers: { Authorization: `Basic ${basicAuth}`, 'privy-app-id': APP_ID! }
	});
	if (!response.ok) {
		throw new Error(`wallet lookup failed: ${response.status}`);
	}
	const body = (await response.json()) as { address?: string };
	if (!body.address) throw new Error('wallet missing address');
	return body.address;
}

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

async function signedWebhookRequest(eventBody: string, privateKey: CryptoKey): Promise<Request> {
	const timestamp = String(NOW);
	const signature = await signWebhookBody(privateKey, timestamp, eventBody);
	return new Request('http://agent.test/webhooks/delegation-required', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'X-Forestrie-Webhook-Timestamp': timestamp,
			'X-Forestrie-Webhook-Signature': signature
		},
		body: eventBody
	});
}

describe.skipIf(!LIVE)('hands-off Mode C sealing (live Privy)', () => {
	let walletAddress: string;
	let signerEnv: SignerEnv;
	let operatorKeysJson: string;
	let rootSignerAddressBytes: Uint8Array;

	beforeAll(async () => {
		walletAddress = await resolveWalletAddress();
		rootSignerAddressBytes = Buffer.from(walletAddress.slice(2), 'hex');
		signerEnv = {
			MANDATE_SIGNER_TOKEN: SIGNER_TOKEN,
			PRIVY_APP_ID: APP_ID!,
			PRIVY_APP_SECRET: APP_SECRET!,
			PRIVY_API_BASE: API_BASE,
			PRIVY_AUTHORIZATION_KEY: AUTH_KEY,
			KEY_DIRECTORY: JSON.stringify({
				'mode-c-hands-off': {
					walletId: WALLET_ID!,
					rootSignerAddress: walletAddress,
					logIds: [TEST_LOG_ID],
					requiresAuthorizationSignature: true
				}
			})
		};
		operatorKeysJson = JSON.stringify({
			[TEST_LOG_ID]: {
				alg: 'KS256',
				rootSignerAddress: walletAddress,
				kind: 'remote',
				signerUrl: SIGNER_URL,
				keyRef: 'mode-c-hands-off'
			}
		});
	}, TIMEOUT_MS);

	it(
		'seals hands-off via remote signer and verifies certificate against publicRoot',
		async () => {
			const delegatedPublicKeyCbor = await generateDelegatedPublicKeyCbor();
			const { privateKey, publicJwk } = await generateWebhookSigningKeyPair();
			const seenStore = new MemorySeenStore();
			let submittedCertificate = '';

			const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
				const url = String(input);
				if (url === SIGNER_URL) {
					return handleSign(new Request(url, init), { env: signerEnv });
				}
				if (url.endsWith('/api/delegations/material')) {
					const body = JSON.parse(String(init?.body)) as { certificate: string };
					submittedCertificate = body.certificate;
					await assertCertificateVerifies(body.certificate, rootSignerAddressBytes);
					return new Response(JSON.stringify({ ok: true, materialKey: 'mk-live' }), {
						status: 200
					});
				}
				throw new Error(`unexpected fetch: ${url}`);
			});

			const event = buildDelegationRequiredEvent({
				root: {
					privateKeyHex: '00',
					rootSignerAddress: walletAddress,
					rootSignerAddressBytes
				},
				delegatedPublicKeyCbor,
				requestKey: `hands-off-${randomBytes(8).toString('hex')}`
			});

			const response = await handleDelegationRequired(
				await signedWebhookRequest(JSON.stringify(event), privateKey),
				{
					jwksResolver: createJwksResolver(publicJwk),
					keyRegistry: new KeyRegistry(operatorKeysJson),
					seenStore,
					coordinatorUpstreamUrl: COORDINATOR_ORIGIN,
					coordinatorAppToken: AGENT_TOKEN,
					mandateSignerToken: SIGNER_TOKEN,
					fetchImpl,
					nowSeconds: NOW
				}
			);

			expect(response.status).toBe(200);
			expect(await response.json()).toEqual({ ok: true });
			expect(submittedCertificate).toBeTruthy();
			expect(fetchImpl).toHaveBeenCalled();
		},
		TIMEOUT_MS
	);

	it(
		'surfaces coordinator reject as 502 without leaking secrets',
		async () => {
			const delegatedPublicKeyCbor = await generateDelegatedPublicKeyCbor();
			const { privateKey, publicJwk } = await generateWebhookSigningKeyPair();

			const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
				const url = String(input);
				if (url === SIGNER_URL) {
					return handleSign(new Request(url, init), { env: signerEnv });
				}
				if (url.endsWith('/api/delegations/material')) {
					return new Response('internal coordinator detail with secret', { status: 403 });
				}
				throw new Error(`unexpected fetch: ${url}`);
			});

			const event = buildDelegationRequiredEvent({
				root: {
					privateKeyHex: '00',
					rootSignerAddress: walletAddress,
					rootSignerAddressBytes
				},
				delegatedPublicKeyCbor,
				requestKey: `hands-off-reject-${randomBytes(8).toString('hex')}`
			});

			const response = await handleDelegationRequired(
				await signedWebhookRequest(JSON.stringify(event), privateKey),
				{
					jwksResolver: createJwksResolver(publicJwk),
					keyRegistry: new KeyRegistry(operatorKeysJson),
					seenStore: new MemorySeenStore(),
					coordinatorUpstreamUrl: COORDINATOR_ORIGIN,
					coordinatorAppToken: AGENT_TOKEN,
					mandateSignerToken: SIGNER_TOKEN,
					fetchImpl,
					nowSeconds: NOW
				}
			);

			expect(response.status).toBe(502);
			const body = (await response.json()) as { error?: string };
			expect(body.error).toBe('material submit failed: 403');
			expect(JSON.stringify(body)).not.toContain('secret');
		},
		TIMEOUT_MS
	);
});
