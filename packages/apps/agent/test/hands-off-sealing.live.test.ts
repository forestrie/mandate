import { randomBytes } from 'node:crypto';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
	createDelegationSigningPolicy,
	onboardModeCWallet,
	PrivyRestClient,
	revokeModeCWallet
} from '@mandate/privy-admin';
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

const APP_ID = process.env.MANDATE_PRIVY_APP_ID;
const APP_SECRET = process.env.MANDATE_PRIVY_APP_SECRET;
const WALLET_ID = process.env.E2E_SIGNER_TEST_PRIVY_WALLET_ID;
const AUTH_KEY = process.env.MANDATE_PRIVY_AUTHORIZATION_KEY;
const API_BASE = process.env.MANDATE_PRIVY_API_BASE?.replace(/\/$/, '');
const LIVE = Boolean(APP_ID && APP_SECRET && WALLET_ID && AUTH_KEY && API_BASE);

const MODE_C_WALLET_ID = process.env.E2E_MODE_C_USER_PRIVY_WALLET_ID;
const MODE_C_OWNER_AUTH_KEY = process.env.E2E_MODE_C_PRIVY_OWNER_AUTH_KEY;
const MODE_C_MANDATE_SIGNER_ID = process.env.MANDATE_PRIVY_SIGNER_ID;
const MODE_C_POLICY_ID = process.env.E2E_MODE_C_PRIVY_POLICY_ID?.trim();
const MODE_C_SIGNER_URL = process.env.MANDATE_SIGNER_URL;
const MODE_C_KEY_REF = 'mode-c-kill-switch-hands-off';
const MODE_C_LOG_ID = 'd4e5f67890abcdef1234567890abcdef';
const LIVE_MODE_C_KILL_SWITCH = Boolean(
	APP_ID &&
	APP_SECRET &&
	AUTH_KEY &&
	MODE_C_WALLET_ID &&
	MODE_C_OWNER_AUTH_KEY &&
	MODE_C_MANDATE_SIGNER_ID
);

const COORDINATOR_ORIGIN = 'http://coordinator.test';
const SIGNER_URL = 'http://signer.local/v1/sign';
const SIGNER_TOKEN = 'live-hands-off-signer-token';
const AGENT_TOKEN = 'live-hands-off-agent-token';
const NOW = Math.floor(Date.now() / 1000);
const TIMEOUT_MS = 90_000;

async function resolveWalletAddress(): Promise<string> {
	const provided = process.env.E2E_SIGNER_TEST_WALLET_ADDRESS?.trim();
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
			MANDATE_PRIVY_APP_ID: APP_ID!,
			MANDATE_PRIVY_APP_SECRET: APP_SECRET!,
			MANDATE_PRIVY_API_BASE: API_BASE!,
			MANDATE_PRIVY_AUTHORIZATION_KEY: AUTH_KEY,
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

describe.skipIf(!LIVE_MODE_C_KILL_SWITCH)(
	'hands-off Mode C kill switch — post-revoke fail-closed (FOR-114)',
	() => {
		let modeCWalletAddress: string;
		let modeCSignerEnv: SignerEnv;
		let modeCOperatorKeysJson: string;
		let modeCRootSignerAddressBytes: Uint8Array;
		let privyClient: PrivyRestClient;

		async function resolveModeCWalletAddress(): Promise<string> {
			const provided = process.env.E2E_MODE_C_USER_WALLET_ADDRESS?.trim();
			if (provided) return provided;
			const basicAuth = Buffer.from(`${APP_ID}:${APP_SECRET}`).toString('base64');
			const response = await fetch(`${API_BASE}/v1/wallets/${MODE_C_WALLET_ID}`, {
				headers: { Authorization: `Basic ${basicAuth}`, 'privy-app-id': APP_ID! }
			});
			if (!response.ok) {
				throw new Error(`mode-c wallet lookup failed: ${response.status}`);
			}
			const body = (await response.json()) as { address?: string };
			if (!body.address) throw new Error('mode-c wallet missing address');
			return body.address;
		}

		async function restoreModeCOnboard(): Promise<void> {
			const policyId =
				MODE_C_POLICY_ID ??
				(
					await createDelegationSigningPolicy(
						privyClient,
						`Mode C kill-switch restore ${Date.now()}`
					)
				).id;

			await onboardModeCWallet(privyClient, {
				walletId: MODE_C_WALLET_ID!,
				mandateSignerId: MODE_C_MANDATE_SIGNER_ID!,
				keyRef: MODE_C_KEY_REF,
				logId: MODE_C_LOG_ID,
				signerUrl: MODE_C_SIGNER_URL!,
				ownerAuthorizationKey: MODE_C_OWNER_AUTH_KEY!,
				policyId
			});
		}

		beforeAll(async () => {
			privyClient = new PrivyRestClient({
				appId: APP_ID!,
				appSecret: APP_SECRET!,
				apiBase: API_BASE!
			});
			modeCWalletAddress = await resolveModeCWalletAddress();
			modeCRootSignerAddressBytes = Buffer.from(modeCWalletAddress.slice(2), 'hex');
			modeCSignerEnv = {
				MANDATE_SIGNER_TOKEN: SIGNER_TOKEN,
				MANDATE_PRIVY_APP_ID: APP_ID!,
				MANDATE_PRIVY_APP_SECRET: APP_SECRET!,
				MANDATE_PRIVY_API_BASE: API_BASE!,
				MANDATE_PRIVY_AUTHORIZATION_KEY: AUTH_KEY,
				KEY_DIRECTORY: JSON.stringify({
					[MODE_C_KEY_REF]: {
						walletId: MODE_C_WALLET_ID!,
						rootSignerAddress: modeCWalletAddress,
						logIds: [MODE_C_LOG_ID],
						requiresAuthorizationSignature: true
					}
				})
			};
			modeCOperatorKeysJson = JSON.stringify({
				[MODE_C_LOG_ID]: {
					alg: 'KS256',
					rootSignerAddress: modeCWalletAddress,
					kind: 'remote',
					signerUrl: SIGNER_URL,
					keyRef: MODE_C_KEY_REF
				}
			});
		}, TIMEOUT_MS);

		it(
			'returns 502 without material submit after revoke, then succeeds after restore',
			async () => {
				await restoreModeCOnboard();

				await revokeModeCWallet(privyClient, {
					walletId: MODE_C_WALLET_ID!,
					ownerAuthorizationKey: MODE_C_OWNER_AUTH_KEY!,
					mandateSignerId: MODE_C_MANDATE_SIGNER_ID!
				});

				const delegatedPublicKeyCbor = await generateDelegatedPublicKeyCbor();
				const { privateKey, publicJwk } = await generateWebhookSigningKeyPair();
				let materialSubmitCount = 0;

				const revokedFetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
					const url = String(input);
					if (url === SIGNER_URL) {
						return handleSign(new Request(url, init), { env: modeCSignerEnv });
					}
					if (url.endsWith('/api/delegations/material')) {
						materialSubmitCount += 1;
						throw new Error('material submit must not be called after revoke');
					}
					throw new Error(`unexpected fetch: ${url}`);
				});

				const revokedEvent = buildDelegationRequiredEvent({
					root: {
						privateKeyHex: '00',
						rootSignerAddress: modeCWalletAddress,
						rootSignerAddressBytes: modeCRootSignerAddressBytes
					},
					delegatedPublicKeyCbor,
					requestKey: `kill-switch-revoked-${randomBytes(8).toString('hex')}`,
					logId: MODE_C_LOG_ID
				});

				const revokedResponse = await handleDelegationRequired(
					await signedWebhookRequest(JSON.stringify(revokedEvent), privateKey),
					{
						jwksResolver: createJwksResolver(publicJwk),
						keyRegistry: new KeyRegistry(modeCOperatorKeysJson),
						seenStore: new MemorySeenStore(),
						coordinatorUpstreamUrl: COORDINATOR_ORIGIN,
						coordinatorAppToken: AGENT_TOKEN,
						mandateSignerToken: SIGNER_TOKEN,
						fetchImpl: revokedFetchImpl,
						nowSeconds: NOW
					}
				);

				expect(revokedResponse.status).toBe(502);
				const revokedBody = (await revokedResponse.json()) as { error?: string };
				expect(revokedBody.error).toBe('delegation signing failed');
				expect(materialSubmitCount).toBe(0);

				await restoreModeCOnboard();

				let submittedCertificate = '';
				const restoredFetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
					const url = String(input);
					if (url === SIGNER_URL) {
						return handleSign(new Request(url, init), { env: modeCSignerEnv });
					}
					if (url.endsWith('/api/delegations/material')) {
						const body = JSON.parse(String(init?.body)) as { certificate: string };
						submittedCertificate = body.certificate;
						await assertCertificateVerifies(body.certificate, modeCRootSignerAddressBytes);
						return new Response(JSON.stringify({ ok: true, materialKey: 'mk-live-restore' }), {
							status: 200
						});
					}
					throw new Error(`unexpected fetch: ${url}`);
				});

				const restoredEvent = buildDelegationRequiredEvent({
					root: {
						privateKeyHex: '00',
						rootSignerAddress: modeCWalletAddress,
						rootSignerAddressBytes: modeCRootSignerAddressBytes
					},
					delegatedPublicKeyCbor: await generateDelegatedPublicKeyCbor(),
					requestKey: `kill-switch-restored-${randomBytes(8).toString('hex')}`,
					logId: MODE_C_LOG_ID
				});

				const restoredResponse = await handleDelegationRequired(
					await signedWebhookRequest(JSON.stringify(restoredEvent), privateKey),
					{
						jwksResolver: createJwksResolver(publicJwk),
						keyRegistry: new KeyRegistry(modeCOperatorKeysJson),
						seenStore: new MemorySeenStore(),
						coordinatorUpstreamUrl: COORDINATOR_ORIGIN,
						coordinatorAppToken: AGENT_TOKEN,
						mandateSignerToken: SIGNER_TOKEN,
						fetchImpl: restoredFetchImpl,
						nowSeconds: NOW
					}
				);

				expect(restoredResponse.status).toBe(200);
				expect(submittedCertificate).toBeTruthy();
			},
			TIMEOUT_MS
		);
	}
);
