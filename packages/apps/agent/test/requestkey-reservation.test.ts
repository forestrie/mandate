import { describe, expect, it, vi } from 'vitest';
import type { SeenStore } from '../src/dedup/seen-store.js';
import { MemorySeenStore } from '../src/dedup/seen-store.js';
import { handleDelegationRequired } from '../src/handle-delegation-required.js';
import { KeyRegistry } from '../src/signer/key-registry.js';
import type { JwksResolver } from '../src/webhook/jwks-resolver.js';
import {
	buildDelegationRequiredEvent,
	generateDelegatedPublicKeyCbor,
	generateTestKs256Root,
	generateWebhookSigningKeyPair,
	signWebhookBody,
	TEST_LOG_ID
} from './test-helpers.js';

const NOW = 1_700_000_000;

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Simulates KV get-then-put with delays so concurrent tryReserve calls can
 * overlap between read and write (best-effort dedup window).
 */
class RaceSimulatingSeenStore implements SeenStore {
	private readonly backing = new Map<string, string>();

	constructor(
		private readonly getDelayMs = 5,
		private readonly putDelayMs = 5
	) {}

	async has(requestKey: string): Promise<boolean> {
		return this.backing.has(requestKey);
	}

	async markSeen(requestKey: string): Promise<void> {
		this.backing.set(requestKey, '1');
	}

	async clear(requestKey: string): Promise<void> {
		this.backing.delete(requestKey);
	}

	async tryReserve(requestKey: string, _ttlSeconds: number) {
		await sleep(this.getDelayMs);
		if (this.backing.has(requestKey)) {
			return 'duplicate' as const;
		}
		await sleep(this.putDelayMs);
		if (this.backing.has(requestKey)) {
			return 'duplicate' as const;
		}
		this.backing.set(requestKey, '1');
		return 'reserved' as const;
	}
}

describe('requestKey reservation', () => {
	it('MemorySeenStore tryReserve is exclusive under concurrent calls', async () => {
		const store = new MemorySeenStore();
		const results = await Promise.all(
			Array.from({ length: 8 }, () => store.tryReserve('same-key', 120))
		);
		expect(results.filter((r) => r === 'reserved')).toHaveLength(1);
		expect(results.filter((r) => r === 'duplicate')).toHaveLength(7);
	});

	it('RaceSimulatingSeenStore allows at most one reserved outcome', async () => {
		const store = new RaceSimulatingSeenStore(8, 8);
		const results = await Promise.all(
			Array.from({ length: 6 }, () => store.tryReserve('race-key', 120))
		);
		expect(results.filter((r) => r === 'reserved').length).toBeLessThanOrEqual(1);
		expect(results.filter((r) => r === 'duplicate').length).toBeGreaterThanOrEqual(5);
	});

	it('handleDelegationRequired submits at most once for concurrent webhooks', async () => {
		const root = await generateTestKs256Root();
		const delegatedPublicKeyCbor = await generateDelegatedPublicKeyCbor();
		const { privateKey, publicJwk } = await generateWebhookSigningKeyPair();
		const seenStore = new RaceSimulatingSeenStore(4, 4);
		let submitCalls = 0;

		const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input);
			if (url.endsWith('/api/delegations/certificate')) {
				submitCalls += 1;
				return new Response(JSON.stringify({ ok: true, certificateKey: 'ck' }), { status: 200 });
			}
			throw new Error(`unexpected fetch: ${url} body=${String(init?.body)}`);
		});

		const operatorKeys = JSON.stringify({
			[TEST_LOG_ID]: {
				alg: 'KS256',
				rootSignerAddress: root.rootSignerAddress,
				kind: 'local',
				privateKeyHex: root.privateKeyHex
			}
		});

		const jwksResolver: JwksResolver = {
			async resolveVerificationKeys() {
				return [publicJwk];
			},
			invalidate() {}
		};

		const event = buildDelegationRequiredEvent({
			root,
			delegatedPublicKeyCbor,
			requestKey: 'concurrent-race-key'
		});
		const eventBody = JSON.stringify(event);
		const timestamp = String(NOW);
		const signature = await signWebhookBody(privateKey, timestamp, eventBody);

		const makeRequest = () =>
			new Request('http://agent.test/webhooks/delegation-required', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'X-Forestrie-Webhook-Timestamp': timestamp,
					'X-Forestrie-Webhook-Signature': signature
				},
				body: eventBody
			});

		const responses = await Promise.all(
			Array.from({ length: 4 }, () =>
				handleDelegationRequired(makeRequest(), {
					jwksResolver,
					keyRegistry: new KeyRegistry(operatorKeys),
					seenStore,
					coordinatorUpstreamUrl: 'http://coordinator.test',
					coordinatorAppToken: 'token',
					mandateSignerToken: 'signer-token',
					fetchImpl,
					nowSeconds: NOW
				})
			)
		);

		for (const response of responses) {
			expect(response.status).toBe(200);
		}
		expect(submitCalls).toBeLessThanOrEqual(1);
	});
});
