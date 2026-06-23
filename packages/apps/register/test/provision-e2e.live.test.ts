import { randomBytes } from 'node:crypto';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { handleDelegationRequired } from '../../agent/src/handle-delegation-required.js';
import { MemorySeenStore } from '../../agent/src/dedup/seen-store.js';
import { KeyRegistry } from '../../agent/src/signer/key-registry.js';
import type { JwksResolver } from '../../agent/src/webhook/jwks-resolver.js';
import { handleSign } from '../../signer/src/handle-sign.js';
import type { Env as SignerEnv } from '../../signer/src/env.js';
import {
	assertCertificateVerifies,
	buildDelegationRequiredEvent,
	generateDelegatedPublicKeyCbor,
	generateWebhookSigningKeyPair,
	signWebhookBody
} from '../../agent/test/test-helpers.js';
import { mintOnboardToken, provisionInstance } from '../src/index.js';

/**
 * Minimal-input Mode C provisioning e2e (FOR-101).
 *
 * Given onboard token + canopy URLs (+ Privy for Mode C), provisions genesis with
 * coordinator webhook forward, then seals hands-off in-process.
 *
 *   doppler run --project mandate-forestrie --config dev -- \
 *   doppler run --project mandate-forestrie --config e2e -- \
 *     pnpm --filter @mandate/register test:live:provision
 */

const CANOPY_BASE = process.env.E2E_CANOPY_API_URL;
const COORDINATOR_URL = process.env.E2E_DELEGATION_COORDINATOR_URL;
const ONBOARD_TOKEN = process.env.E2E_CANOPY_PAYMENTS_ONBOARD_TOKEN;
const OPS_ADMIN = process.env.E2E_CANOPY_OPS_ADMIN_TOKEN;
const UNIVOCITY_ADDR = process.env.E2E_CANOPY_UNIVOCITY_ADDR;
const CHAIN_ID = process.env.E2E_CANOPY_CHAIN_ID;
const WEBHOOK_URL = process.env.E2E_MANDATE_AGENT_WEBHOOK_URL;

const APP_ID = process.env.MANDATE_PRIVY_APP_ID;
const APP_SECRET = process.env.MANDATE_PRIVY_APP_SECRET;
const WALLET_ID = process.env.E2E_MODE_C_USER_PRIVY_WALLET_ID;
const AUTH_KEY = process.env.MANDATE_PRIVY_AUTHORIZATION_KEY;
const MANDATE_SIGNER_ID = process.env.MANDATE_PRIVY_SIGNER_ID;
const OWNER_AUTH_KEY = process.env.E2E_MODE_C_PRIVY_OWNER_AUTH_KEY;
const DELEGATION_POLICY_ID = process.env.E2E_MODE_C_PRIVY_POLICY_ID;
const SIGNER_URL = process.env.MANDATE_SIGNER_URL;
const API_BASE = process.env.MANDATE_PRIVY_API_BASE?.replace(/\/$/, '');

const LIVE = Boolean(
	CANOPY_BASE &&
	COORDINATOR_URL &&
	UNIVOCITY_ADDR &&
	CHAIN_ID &&
	WEBHOOK_URL &&
	(ONBOARD_TOKEN || OPS_ADMIN) &&
	APP_ID &&
	APP_SECRET &&
	API_BASE &&
	WALLET_ID &&
	AUTH_KEY &&
	MANDATE_SIGNER_ID &&
	OWNER_AUTH_KEY &&
	SIGNER_URL
);

const SIGNER_TOKEN = 'live-provision-signer-token';
const AGENT_TOKEN = 'live-provision-agent-token';
const NOW = Math.floor(Date.now() / 1000);
const TIMEOUT_MS = 120_000;

async function resolveWalletAddress(): Promise<string> {
	const provided = process.env.E2E_MODE_C_USER_WALLET_ADDRESS?.trim();
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

describe.skipIf(!LIVE)('provision + hands-off seal (live)', () => {
	let walletAddress: string;
	let signerEnv: SignerEnv;
	let provisioned: Awaited<ReturnType<typeof provisionInstance>>;

	beforeAll(async () => {
		walletAddress = await resolveWalletAddress();
		signerEnv = {
			MANDATE_SIGNER_TOKEN: SIGNER_TOKEN,
			MANDATE_PRIVY_APP_ID: APP_ID!,
			MANDATE_PRIVY_APP_SECRET: APP_SECRET!,
			MANDATE_PRIVY_API_BASE: API_BASE!,
			MANDATE_PRIVY_AUTHORIZATION_KEY: AUTH_KEY,
			KEY_DIRECTORY: JSON.stringify({
				'provision-live': {
					walletId: WALLET_ID!,
					rootSignerAddress: walletAddress,
					logIds: [],
					requiresAuthorizationSignature: true
				}
			})
		};

		const onboardToken =
			ONBOARD_TOKEN ??
			(await mintOnboardToken({
				canopyBaseUrl: CANOPY_BASE!,
				opsAdminToken: OPS_ADMIN!
			}));

		provisioned = await provisionInstance({
			onboardToken,
			canopyBaseUrl: CANOPY_BASE!,
			coordinatorBaseUrl: COORDINATOR_URL!,
			agentWebhookUrl: WEBHOOK_URL!,
			mode: 'C',
			univocityAddr: UNIVOCITY_ADDR!,
			chainId: CHAIN_ID!,
			modeC: {
				appId: APP_ID!,
				appSecret: APP_SECRET!,
				apiBase: API_BASE!,
				walletId: WALLET_ID!,
				mandateSignerId: MANDATE_SIGNER_ID!,
				ownerAuthorizationKey: OWNER_AUTH_KEY!,
				signerUrl: SIGNER_URL!,
				keyRef: 'provision-live',
				policyId: DELEGATION_POLICY_ID
			}
		});

		signerEnv = {
			...signerEnv,
			KEY_DIRECTORY: JSON.stringify(provisioned.descriptors.keyDirectory)
		};
	}, TIMEOUT_MS);

	it(
		'provisions genesis with coordinator forward ok',
		() => {
			expect(provisioned.genesis.class).toBe('payment-authoritative');
			expect(provisioned.coordinator.publicRoot).toBe('ok');
			expect(provisioned.coordinator.webhook).toBe('ok');
			expect(provisioned.descriptors.operatorRootKeys[provisioned.logIdHex32]).toBeDefined();
		},
		TIMEOUT_MS
	);

	it(
		'seals hands-off using provisioned descriptors',
		async () => {
			const logId = provisioned.logIdHex32;
			const rootSignerAddressBytes = Buffer.from(walletAddress.slice(2), 'hex');
			const operatorKeysJson = JSON.stringify(provisioned.descriptors.operatorRootKeys);
			const remoteSignerUrl = provisioned.descriptors.operatorRootKeys[logId]!.signerUrl;

			const delegatedPublicKeyCbor = await generateDelegatedPublicKeyCbor();
			const { privateKey, publicJwk } = await generateWebhookSigningKeyPair();
			let submittedCertificate = '';

			const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
				const url = String(input);
				if (url === remoteSignerUrl) {
					return handleSign(new Request(url, init), { env: signerEnv });
				}
				if (url.endsWith('/api/delegations/material')) {
					const body = JSON.parse(String(init?.body)) as { certificate: string };
					submittedCertificate = body.certificate;
					await assertCertificateVerifies(body.certificate, rootSignerAddressBytes);
					return new Response(JSON.stringify({ ok: true, materialKey: 'mk-provision-live' }), {
						status: 200
					});
				}
				throw new Error(`unexpected fetch: ${url}`);
			});

			const coordinatorOrigin = new URL(COORDINATOR_URL!).origin;
			const materialSubmitUrl = `${COORDINATOR_URL!.replace(/\/$/, '')}/api/delegations/material`;

			const event = buildDelegationRequiredEvent({
				root: {
					privateKeyHex: '00',
					rootSignerAddress: walletAddress,
					rootSignerAddressBytes
				},
				delegatedPublicKeyCbor,
				requestKey: `provision-live-${randomBytes(8).toString('hex')}`,
				materialSubmitUrl
			});
			event.logId = logId;
			event.authLogId = logId;

			const response = await handleDelegationRequired(
				await signedWebhookRequest(JSON.stringify(event), privateKey),
				{
					jwksResolver: createJwksResolver(publicJwk),
					keyRegistry: new KeyRegistry(operatorKeysJson),
					seenStore: new MemorySeenStore(),
					coordinatorUpstreamUrl: coordinatorOrigin,
					coordinatorAppToken: AGENT_TOKEN,
					mandateSignerToken: SIGNER_TOKEN,
					fetchImpl,
					nowSeconds: NOW
				}
			);

			expect(response.status).toBe(200);
			expect(submittedCertificate).toBeTruthy();
		},
		TIMEOUT_MS
	);
});
