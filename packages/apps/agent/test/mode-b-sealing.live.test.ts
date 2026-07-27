import { randomBytes } from 'node:crypto';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { handleDelegationRequired } from '../src/handle-delegation-required.js';
import { MemorySeenStore } from '../src/dedup/seen-store.js';
import { KeyRegistry } from '../src/signer/key-registry.js';
import type { JwksResolver } from '../src/webhook/jwks-resolver.js';
import {
	assertCertificateVerifies,
	buildDelegationRequiredEvent,
	generateDelegatedPublicKeyCbor,
	generateWebhookSigningKeyPair,
	signWebhookBody
} from './test-helpers.js';
import { mintOnboardToken, provisionInstance, rFromLogIdHex32 } from '../../register/src/index.js';

/**
 * Mode B live sealing (FOR-210): webhook → agent → reference user signer → cert verify.
 *
 * Requires deployed @mandate/reference-user-signer and matching USER_SIGNER_KEYS_JSON.
 *
 *   doppler run --project mandate-forestrie --config dev -- \
 *   doppler run --project mandate-forestrie --config e2e -- \
 *     LIVE_MODE_B=1 pnpm --filter @mandate/agent test:live:mode-b
 */

interface UserSignerKeyEntry {
	privateKeyHex: string;
	rootSignerAddress: string;
	keyRef: string;
}

function parseUserSignerKeysJson(raw: string): { logIdHex32: string; entry: UserSignerKeyEntry } {
	const parsed = JSON.parse(raw) as Record<string, UserSignerKeyEntry>;
	const [logIdHex32, entry] = Object.entries(parsed)[0] ?? [];
	if (!logIdHex32 || !entry?.privateKeyHex || !entry.rootSignerAddress || !entry.keyRef) {
		throw new Error('USER_SIGNER_KEYS_JSON must contain at least one complete log entry');
	}
	return { logIdHex32, entry };
}

const CANOPY_BASE = process.env.E2E_CANOPY_API_URL;
const COORDINATOR_URL = process.env.E2E_DELEGATION_COORDINATOR_URL;
const ONBOARD_TOKEN = process.env.E2E_CANOPY_PAYMENTS_ONBOARD_TOKEN;
const OPS_ADMIN = process.env.E2E_CANOPY_OPS_ADMIN_TOKEN;
const UNIVOCITY_ADDR = process.env.E2E_CANOPY_UNIVOCITY_ADDR;
const CHAIN_ID = process.env.E2E_CANOPY_CHAIN_ID;
const WEBHOOK_URL = process.env.E2E_MANDATE_AGENT_WEBHOOK_URL;
const USER_SIGNER_URL = process.env.E2E_USER_SIGNER_URL;
const USER_SIGNER_BEARER = process.env.USER_SIGNER_BEARER;
const USER_SIGNER_KEYS_JSON = process.env.USER_SIGNER_KEYS_JSON;
const MANDATE_SIGNER_URL = process.env.MANDATE_SIGNER_URL;

const LIVE = Boolean(
	process.env.LIVE_MODE_B === '1' &&
	CANOPY_BASE &&
	COORDINATOR_URL &&
	UNIVOCITY_ADDR &&
	CHAIN_ID &&
	WEBHOOK_URL &&
	(ONBOARD_TOKEN || OPS_ADMIN) &&
	USER_SIGNER_URL &&
	USER_SIGNER_BEARER &&
	USER_SIGNER_KEYS_JSON &&
	MANDATE_SIGNER_URL
);

const AGENT_TOKEN = 'live-mode-b-agent-token';
const MANDATE_SIGNER_TOKEN = 'live-mode-b-mandate-signer-token-should-not-be-used';
const NOW = Math.floor(Date.now() / 1000);
const TIMEOUT_MS = 120_000;

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

describe.skipIf(!LIVE)('Mode B live sealing (reference user signer)', () => {
	let provisioned: Awaited<ReturnType<typeof provisionInstance>>;
	let rootSignerAddress: string;
	let rootSignerAddressBytes: Uint8Array;
	let userSignerUrl: string;
	let keyRef: string;

	beforeAll(async () => {
		const { logIdHex32, entry } = parseUserSignerKeysJson(USER_SIGNER_KEYS_JSON!);
		rootSignerAddress = entry.rootSignerAddress;
		rootSignerAddressBytes = Buffer.from(rootSignerAddress.replace(/^0x/i, ''), 'hex');
		userSignerUrl = USER_SIGNER_URL!;
		keyRef = entry.keyRef;

		const onboardToken =
			ONBOARD_TOKEN ??
			(
				await mintOnboardToken({
					canopyBaseUrl: CANOPY_BASE!,
					opsAdminToken: OPS_ADMIN!,
					chainId: CHAIN_ID!,
					univocityAddr: UNIVOCITY_ADDR!
				})
			).token;

		provisioned = await provisionInstance({
			onboardToken,
			canopyBaseUrl: CANOPY_BASE!,
			coordinatorBaseUrl: COORDINATOR_URL!,
			agentWebhookUrl: WEBHOOK_URL!,
			mode: 'B',
			univocityAddr: UNIVOCITY_ADDR!,
			chainId: CHAIN_ID!,
			forestR: rFromLogIdHex32(logIdHex32),
			modeB: {
				rootSignerAddress,
				userSignerUrl,
				keyRef
			}
		});
	}, TIMEOUT_MS);

	it(
		'L1: provisions Mode B with empty KEY_DIRECTORY and bearerEnvKey descriptor',
		() => {
			expect(provisioned.mode).toBe('B');
			expect(provisioned.descriptors.keyDirectory).toEqual({});
			const descriptor = provisioned.descriptors.operatorRootKeys[provisioned.logIdHex32];
			expect(descriptor?.signerUrl).toBe(userSignerUrl);
			expect(descriptor?.bearerEnvKey).toBe('USER_SIGNER_BEARER');
			expect(provisioned.coordinator.publicRoot).toBe('ok');
			expect(provisioned.coordinator.webhook).toBe('ok');
		},
		TIMEOUT_MS
	);

	it(
		'L3: provisioned Mode B signerUrl is not mandate-signer URL',
		() => {
			const descriptor = provisioned.descriptors.operatorRootKeys[provisioned.logIdHex32]!;
			expect(descriptor.signerUrl).not.toBe(MANDATE_SIGNER_URL);
			expect(descriptor.signerUrl).toBe(userSignerUrl);
		},
		TIMEOUT_MS
	);

	it(
		'L2/L4: seals via user signer bearer and verifies certificate against publicRoot',
		async () => {
			const logId = provisioned.logIdHex32;
			const operatorKeysJson = JSON.stringify(provisioned.descriptors.operatorRootKeys);

			const delegatedPublicKeyCbor = await generateDelegatedPublicKeyCbor();
			const { privateKey, publicJwk } = await generateWebhookSigningKeyPair();
			let submittedCertificate = '';
			let userSignerAuthorization = '';

			const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
				const url = String(input);
				if (url === userSignerUrl) {
					userSignerAuthorization =
						(init?.headers as Record<string, string> | undefined)?.Authorization ?? '';
					return fetch(input, init);
				}
				if (url.endsWith('/api/delegations/certificate')) {
					const body = JSON.parse(String(init?.body)) as { certificate: string };
					submittedCertificate = body.certificate;
					await assertCertificateVerifies(body.certificate, rootSignerAddressBytes);
					return new Response(JSON.stringify({ ok: true, materialKey: 'mk-mode-b-live' }), {
						status: 200
					});
				}
				throw new Error(`unexpected fetch: ${url}`);
			});

			const coordinatorOrigin = new URL(COORDINATOR_URL!).origin;
			const materialSubmitUrl = `${COORDINATOR_URL!.replace(/\/$/, '')}/api/delegations/certificate`;

			const event = buildDelegationRequiredEvent({
				root: {
					privateKeyHex: '00',
					rootSignerAddress,
					rootSignerAddressBytes
				},
				delegatedPublicKeyCbor,
				requestKey: `mode-b-live-${randomBytes(8).toString('hex')}`,
				materialSubmitUrl,
				logId
			});

			const response = await handleDelegationRequired(
				await signedWebhookRequest(JSON.stringify(event), privateKey),
				{
					jwksResolver: createJwksResolver(publicJwk),
					keyRegistry: new KeyRegistry(operatorKeysJson),
					seenStore: new MemorySeenStore(),
					coordinatorUpstreamUrl: coordinatorOrigin,
					coordinatorAppToken: AGENT_TOKEN,
					mandateSignerToken: MANDATE_SIGNER_TOKEN,
					remoteBearerEnv: { USER_SIGNER_BEARER: USER_SIGNER_BEARER! },
					fetchImpl,
					nowSeconds: NOW
				}
			);

			expect(response.status).toBe(200);
			expect(submittedCertificate).toBeTruthy();
			expect(userSignerAuthorization).toBe(`Bearer ${USER_SIGNER_BEARER}`);
			expect(userSignerAuthorization).not.toBe(`Bearer ${MANDATE_SIGNER_TOKEN}`);
			expect(fetchImpl).toHaveBeenCalled();
		},
		TIMEOUT_MS
	);
});
