import { describe, expect, it, vi } from 'vitest';
import {
	handleDelegationRequired,
	REQUEST_KEY_RESERVATION_TTL_SECONDS
} from '../src/handle-delegation-required.js';
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

const COORDINATOR_ORIGIN = 'http://coordinator.test';
const NOW = 1_700_000_000;
const TEST_AGENT_DEPS = {
	coordinatorUpstreamUrl: COORDINATOR_ORIGIN,
	coordinatorAppToken: 'test-token',
	mandateSignerToken: 'test-signer-token'
} as const;

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

function operatorKeysJson(root: Awaited<ReturnType<typeof generateTestKs256Root>>): string {
	return JSON.stringify({
		[TEST_LOG_ID]: {
			alg: 'KS256',
			rootSignerAddress: root.rootSignerAddress,
			kind: 'local',
			privateKeyHex: root.privateKeyHex
		}
	});
}

async function signedWebhookRequest(opts: {
	eventBody: string;
	privateKey: CryptoKey;
	timestamp?: string;
}): Promise<Request> {
	const timestamp = opts.timestamp ?? String(NOW);
	const signature = await signWebhookBody(opts.privateKey, timestamp, opts.eventBody);
	return new Request('http://agent.test/webhooks/delegation-required', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'X-Forestrie-Webhook-Timestamp': timestamp,
			'X-Forestrie-Webhook-Signature': signature
		},
		body: opts.eventBody
	});
}

describe('handleDelegationRequired', () => {
	it('verifies webhook, signs material, submits to coordinator, and dedups replay', async () => {
		const root = await generateTestKs256Root();
		const delegatedPublicKeyCbor = await generateDelegatedPublicKeyCbor();
		const { privateKey, publicJwk } = await generateWebhookSigningKeyPair();
		const seenStore = new MemorySeenStore();
		let submittedCertificate = '';

		const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input);
			if (url.endsWith('/api/delegations/material')) {
				const body = JSON.parse(String(init?.body)) as { certificate: string };
				submittedCertificate = body.certificate;
				await assertCertificateVerifies(body.certificate, root.rootSignerAddressBytes);
				return new Response(JSON.stringify({ ok: true, materialKey: 'mk' }), { status: 200 });
			}
			throw new Error(`unexpected fetch: ${url}`);
		});

		const event = buildDelegationRequiredEvent({
			root,
			delegatedPublicKeyCbor,
			requestKey: 'golden-request-key'
		});
		const eventBody = JSON.stringify(event);
		const request = await signedWebhookRequest({ eventBody, privateKey });

		const response = await handleDelegationRequired(request, {
			jwksResolver: createJwksResolver(publicJwk),
			keyRegistry: new KeyRegistry(operatorKeysJson(root)),
			seenStore,
			...TEST_AGENT_DEPS,
			fetchImpl,
			nowSeconds: NOW
		});

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ ok: true });
		expect(submittedCertificate).toBeTruthy();
		expect(fetchImpl).toHaveBeenCalledTimes(1);

		const replay = await handleDelegationRequired(
			await signedWebhookRequest({ eventBody, privateKey }),
			{
				jwksResolver: createJwksResolver(publicJwk),
				keyRegistry: new KeyRegistry(operatorKeysJson(root)),
				seenStore,
				...TEST_AGENT_DEPS,
				fetchImpl,
				nowSeconds: NOW
			}
		);
		expect(replay.status).toBe(200);
		expect(await replay.json()).toEqual({ ok: true, duplicate: true });
		expect(fetchImpl).toHaveBeenCalledTimes(1);
	});

	it('reserves requestKey before coordinator submit', async () => {
		const root = await generateTestKs256Root();
		const delegatedPublicKeyCbor = await generateDelegatedPublicKeyCbor();
		const { privateKey, publicJwk } = await generateWebhookSigningKeyPair();
		const seenStore = new MemorySeenStore();
		let reservedBeforeSubmit = false;

		const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.endsWith('/api/delegations/material')) {
				reservedBeforeSubmit = await seenStore.has('reserve-key');
				return new Response(JSON.stringify({ ok: true }), { status: 200 });
			}
			throw new Error(`unexpected fetch: ${url}`);
		});

		const event = buildDelegationRequiredEvent({
			root,
			delegatedPublicKeyCbor,
			requestKey: 'reserve-key'
		});
		const response = await handleDelegationRequired(
			await signedWebhookRequest({ eventBody: JSON.stringify(event), privateKey }),
			{
				jwksResolver: createJwksResolver(publicJwk),
				keyRegistry: new KeyRegistry(operatorKeysJson(root)),
				seenStore,
				...TEST_AGENT_DEPS,
				fetchImpl,
				nowSeconds: NOW
			}
		);
		expect(response.status).toBe(200);
		expect(reservedBeforeSubmit).toBe(true);
		expect(REQUEST_KEY_RESERVATION_TTL_SECONDS).toBe(120);
	});

	it('rejects invalid webhook signature', async () => {
		const root = await generateTestKs256Root();
		const { publicJwk } = await generateWebhookSigningKeyPair();
		const eventBody = JSON.stringify(
			buildDelegationRequiredEvent({
				root,
				delegatedPublicKeyCbor: await generateDelegatedPublicKeyCbor()
			})
		);

		const response = await handleDelegationRequired(
			new Request('http://agent.test/webhooks/delegation-required', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'X-Forestrie-Webhook-Timestamp': String(NOW),
					'X-Forestrie-Webhook-Signature': 'invalid'
				},
				body: eventBody
			}),
			{
				jwksResolver: createJwksResolver(publicJwk),
				keyRegistry: new KeyRegistry(operatorKeysJson(root)),
				seenStore: new MemorySeenStore(),
				...TEST_AGENT_DEPS,
				nowSeconds: NOW
			}
		);
		expect(response.status).toBe(401);
	});

	it('rejects stale webhook timestamp', async () => {
		const root = await generateTestKs256Root();
		const { privateKey, publicJwk } = await generateWebhookSigningKeyPair();
		const eventBody = JSON.stringify(
			buildDelegationRequiredEvent({
				root,
				delegatedPublicKeyCbor: await generateDelegatedPublicKeyCbor()
			})
		);

		const response = await handleDelegationRequired(
			await signedWebhookRequest({
				eventBody,
				privateKey,
				timestamp: String(NOW - 10_000)
			}),
			{
				jwksResolver: createJwksResolver(publicJwk),
				keyRegistry: new KeyRegistry(operatorKeysJson(root)),
				seenStore: new MemorySeenStore(),
				...TEST_AGENT_DEPS,
				nowSeconds: NOW
			}
		);
		expect(response.status).toBe(401);
	});

	it('rejects unknown logId', async () => {
		const root = await generateTestKs256Root();
		const { privateKey, publicJwk } = await generateWebhookSigningKeyPair();
		const event = buildDelegationRequiredEvent({
			root,
			delegatedPublicKeyCbor: await generateDelegatedPublicKeyCbor()
		});
		event.logId = 'ffffffffffffffffffffffffffffffff';
		const eventBody = JSON.stringify(event);

		const response = await handleDelegationRequired(
			await signedWebhookRequest({ eventBody, privateKey }),
			{
				jwksResolver: createJwksResolver(publicJwk),
				keyRegistry: new KeyRegistry(operatorKeysJson(root)),
				seenStore: new MemorySeenStore(),
				...TEST_AGENT_DEPS,
				nowSeconds: NOW
			}
		);
		expect(response.status).toBe(404);
	});

	it('rejects unsupported event type', async () => {
		const root = await generateTestKs256Root();
		const { privateKey, publicJwk } = await generateWebhookSigningKeyPair();
		const event = {
			...buildDelegationRequiredEvent({
				root,
				delegatedPublicKeyCbor: await generateDelegatedPublicKeyCbor()
			}),
			type: 'delegation.other'
		};
		const eventBody = JSON.stringify(event);

		const response = await handleDelegationRequired(
			await signedWebhookRequest({ eventBody, privateKey }),
			{
				jwksResolver: createJwksResolver(publicJwk),
				keyRegistry: new KeyRegistry(operatorKeysJson(root)),
				seenStore: new MemorySeenStore(),
				...TEST_AGENT_DEPS,
				nowSeconds: NOW
			}
		);
		expect(response.status).toBe(400);
	});

	it('returns generic 502 when remote signer fails and clears requestKey reservation', async () => {
		const root = await generateTestKs256Root();
		const delegatedPublicKeyCbor = await generateDelegatedPublicKeyCbor();
		const { privateKey, publicJwk } = await generateWebhookSigningKeyPair();
		const seenStore = new MemorySeenStore();
		const signerUrl = 'http://signer.test/v1/sign';
		const requestKey = 'remote-signer-fail-key';

		const remoteOperatorKeys = JSON.stringify({
			[TEST_LOG_ID]: {
				alg: 'KS256',
				rootSignerAddress: root.rootSignerAddress,
				kind: 'remote',
				signerUrl,
				keyRef: 'remote-key-ref'
			}
		});

		const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url === signerUrl) {
				return new Response('internal signer secret detail', { status: 500 });
			}
			throw new Error(`unexpected fetch: ${url}`);
		});

		const event = buildDelegationRequiredEvent({
			root,
			delegatedPublicKeyCbor,
			requestKey
		});
		const eventBody = JSON.stringify(event);

		const response = await handleDelegationRequired(
			await signedWebhookRequest({ eventBody, privateKey }),
			{
				jwksResolver: createJwksResolver(publicJwk),
				keyRegistry: new KeyRegistry(remoteOperatorKeys),
				seenStore,
				...TEST_AGENT_DEPS,
				fetchImpl,
				nowSeconds: NOW
			}
		);

		expect(response.status).toBe(502);
		const body = (await response.json()) as { ok?: boolean; error?: string };
		expect(body).toEqual({ ok: false, error: 'delegation signing failed' });
		expect(JSON.stringify(body)).not.toContain('secret');
		expect(await seenStore.has(requestKey)).toBe(false);
	});
});
