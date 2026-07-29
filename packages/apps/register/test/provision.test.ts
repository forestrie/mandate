import {
	decodeCborDeterministic as decodeCbor,
	encodeCborDeterministic as encodeCbor
} from '@forestrie/encoding';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KeyRegistry } from '../../agent/src/signer/key-registry.js';
import { resolveSigner } from '../../agent/src/signer/resolve-signer.js';
import { RemoteKs256Signer } from '../../agent/src/signer/remote-ks256-signer.js';

const FOREST_R = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const LOG_ID = 'a1b2c3d4e5f67890abcdef1234567890';
const WALLET_ADDRESS = `0x${'ab'.repeat(20)}`;

const onboardModeCWallet = vi.fn(async () => ({
	walletId: 'wallet-1',
	walletAddress: WALLET_ADDRESS,
	policyId: 'policy-1',
	keyRef: 'user-log-wallet',
	logId: LOG_ID,
	keyDirectory: {
		'user-log-wallet': {
			walletId: 'wallet-1',
			rootSignerAddress: WALLET_ADDRESS,
			logIds: [LOG_ID],
			requiresAuthorizationSignature: true as const
		}
	},
	operatorRootKeys: {
		[LOG_ID]: {
			alg: 'KS256' as const,
			rootSignerAddress: WALLET_ADDRESS,
			kind: 'remote' as const,
			signerUrl: 'https://signer.example/v1/sign',
			keyRef: 'user-log-wallet'
		}
	}
}));

vi.mock('@mandate/privy-admin', () => ({
	PrivyRestClient: class {},
	onboardModeCWallet
}));

const { provisionInstance } = await import('../src/provision.js');

function intKeyMap(body: Uint8Array): Map<number, unknown> {
	const decoded = decodeCbor(body);
	if (decoded instanceof Map) return decoded;
	if (typeof decoded === 'object' && decoded !== null) {
		return new Map(
			Object.entries(decoded as Record<string, unknown>).map(([k, v]) => [Number(k), v])
		);
	}
	throw new Error('expected CBOR map');
}

describe('provisionInstance', () => {
	beforeEach(() => {
		onboardModeCWallet.mockClear();
	});

	it('Mode C emits descriptors consumable by KeyRegistry and resolveSigner', async () => {
		const coordinator = { publicRoot: 'ok' as const, webhook: 'ok' as const };
		const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			expect(url).toContain(`/api/forest/${FOREST_R}/genesis`);
			expect(url).toContain('webhookUrl=');
			return new Response(
				encodeCbor({
					R: FOREST_R,
					chainBinding: { chainId: '84532', univocityAddr: 'cd'.repeat(20) },
					coordinator
				}) as unknown as BodyInit,
				{ status: 201 }
			);
		});

		const result = await provisionInstance({
			onboardToken: 'onboard-token',
			canopyBaseUrl: 'https://api.example.dev',
			coordinatorBaseUrl: 'https://coordinator.example.dev',
			agentWebhookUrl: 'https://agent.example/webhooks/delegation-required',
			mode: 'C',
			univocityAddr: 'cd'.repeat(20),
			chainId: '84532',
			forestR: FOREST_R,
			fetchImpl,
			modeC: {
				appId: 'app',
				appSecret: 'secret',
				apiBase: 'https://api.privy.io',
				walletId: 'wallet-1',
				mandateSignerId: 'signer-1',
				ownerAuthorizationKey: 'owner-key',
				signerUrl: 'https://signer.example/v1/sign'
			}
		});

		expect(onboardModeCWallet).toHaveBeenCalledOnce();
		expect(result.logIdHex32).toBe(LOG_ID);
		expect(result.coordinator).toEqual(coordinator);

		const operatorKeysJson = JSON.stringify(result.descriptors.operatorRootKeys);
		const registry = new KeyRegistry(operatorKeysJson);
		const descriptor = registry.get(LOG_ID);
		expect(descriptor.kind).toBe('remote');
		const signer = resolveSigner(registry, LOG_ID, 'token', fetchImpl);
		expect(signer).toBeInstanceOf(RemoteKs256Signer);
	});

	it('R-E-14: Mode B emits remote user-signer descriptor without KEY_DIRECTORY', async () => {
		const coordinator = { publicRoot: 'ok' as const, webhook: 'ok' as const };
		const fetchImpl = vi.fn(
			async () =>
				new Response(
					encodeCbor({
						R: FOREST_R,
						chainBinding: { chainId: '84532', univocityAddr: 'cd'.repeat(20) },
						coordinator
					}) as unknown as BodyInit,
					{ status: 201 }
				)
		);

		const result = await provisionInstance({
			onboardToken: 'onboard-token',
			canopyBaseUrl: 'https://api.example.dev',
			coordinatorBaseUrl: 'https://coordinator.example.dev',
			agentWebhookUrl: 'https://agent.example/webhooks/delegation-required',
			mode: 'B',
			univocityAddr: 'cd'.repeat(20),
			chainId: '84532',
			forestR: FOREST_R,
			fetchImpl,
			modeB: {
				rootSignerAddress: WALLET_ADDRESS,
				userSignerUrl: 'https://user-signer.example/v1/sign',
				keyRef: 'user-remote'
			}
		});

		expect(result.descriptors.keyDirectory).toEqual({});
		expect(result.descriptors.operatorRootKeys[LOG_ID]?.signerUrl).toBe(
			'https://user-signer.example/v1/sign'
		);
		expect(result.descriptors.operatorRootKeys[LOG_ID]?.bearerEnvKey).toBe('USER_SIGNER_BEARER');
		expect(result.descriptors.operatorRootKeys[LOG_ID]?.kind).toBe('remote');
		expect(result.descriptors.operatorRootKeys[LOG_ID]?.keyRef).toBe('user-remote');
	});

	it('maps a genesis 409 to ReservationConflictError naming the account (D7)', async () => {
		const fetchImpl = vi.fn(
			async () =>
				new Response('Univocity instance is already registered to forest root some-other-root', {
					status: 409
				})
		);
		await expect(
			provisionInstance({
				onboardToken: 'onboard-token',
				canopyBaseUrl: 'https://api.example.dev',
				coordinatorBaseUrl: 'https://coordinator.example.dev',
				agentWebhookUrl: 'https://agent.example/webhooks/delegation-required',
				mode: 'B',
				univocityAddr: 'cd'.repeat(20),
				chainId: '84532',
				forestR: FOREST_R,
				fetchImpl,
				modeB: {
					rootSignerAddress: WALLET_ADDRESS,
					userSignerUrl: 'https://user-signer.example/v1/sign',
					keyRef: 'user-remote'
				}
			})
		).rejects.toMatchObject({
			name: 'ReservationConflictError',
			univocityInstanceId: `eip155:84532:0x${'cd'.repeat(20)}`
		});
	});

	it('Safe 1x1 (Mode D) emits an interactive descriptor the agent refuses to sign with', async () => {
		const coordinator = { publicRoot: 'ok' as const, webhook: 'ok' as const };
		const safeAddress = `0x${'cd'.repeat(20)}`;
		let postedBody: Uint8Array | undefined;
		const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
			postedBody = new Uint8Array(init?.body as ArrayBuffer);
			return new Response(
				encodeCbor({
					R: FOREST_R,
					chainBinding: { chainId: '84532', univocityAddr: 'ab'.repeat(20) },
					coordinator
				}) as unknown as BodyInit,
				{ status: 201 }
			);
		});

		const result = await provisionInstance({
			onboardToken: 'onboard-token',
			canopyBaseUrl: 'https://api.example.dev',
			coordinatorBaseUrl: 'https://coordinator.example.dev',
			agentWebhookUrl: 'https://agent.example/webhooks/delegation-required',
			mode: 'D',
			univocityAddr: 'ab'.repeat(20),
			chainId: '84532',
			forestR: FOREST_R,
			fetchImpl,
			modeD: { safeAddress }
		});

		// Genesis bootstrapKey is the bare Safe address (plan-0029: the KS256
		// 20-byte address may be a contract account — no new COSE alg).
		expect(postedBody).toBeDefined();
		const map = intKeyMap(postedBody!);
		expect(map.get(-68015)).toEqual(new Uint8Array(20).fill(0xcd));

		// No signer service anywhere: no KEY_DIRECTORY, no signerUrl, no keyRef.
		expect(result.descriptors.keyDirectory).toEqual({});
		const entry = result.descriptors.operatorRootKeys[LOG_ID];
		expect(entry?.kind).toBe('interactive');
		expect(entry?.rootSignerAddress).toBe(safeAddress);
		expect(entry?.signerUrl).toBeUndefined();
		expect(entry?.keyRef).toBeUndefined();

		// The agent's signing path must refuse the interactive root outright;
		// metadata introspection still works.
		const registry = new KeyRegistry(JSON.stringify(result.descriptors.operatorRootKeys));
		expect(() => registry.get(LOG_ID)).toThrow(/signs in the console/);
		expect(registry.describe(LOG_ID).kind).toBe('interactive');

		// A misassembled descriptor (interactive + signerUrl) fails fast at load
		// so a signing path can never form for a console-only root.
		const malformed = JSON.stringify({
			[LOG_ID]: {
				alg: 'KS256',
				rootSignerAddress: safeAddress,
				kind: 'interactive',
				signerUrl: 'https://signer.example/v1/sign'
			}
		});
		expect(() => new KeyRegistry(malformed).describe(LOG_ID)).toThrow(/signerUrl must not be set/);
	});

	it('Mode B uups-counterfactual emits genesis labels and webhookUrl query', async () => {
		const coordinator = { publicRoot: 'ok' as const, webhook: 'ok' as const };
		const deployerHex = 'ef'.repeat(20);
		let postedBody: Uint8Array | undefined;
		const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input);
			expect(url).toContain(`/api/forest/${FOREST_R}/genesis`);
			expect(url).toContain('webhookUrl=');
			expect(init?.headers).toBeDefined();
			const headers = init?.headers as Record<string, string>;
			expect(headers['X-Forestrie-Agent-Webhook']).toBeUndefined();
			postedBody = new Uint8Array(init?.body as ArrayBuffer);
			return new Response(
				encodeCbor({
					R: FOREST_R,
					chainBinding: { chainId: '84532', univocityAddr: 'cd'.repeat(20) },
					coordinator
				}) as unknown as BodyInit,
				{ status: 201 }
			);
		});

		const result = await provisionInstance({
			onboardToken: 'onboard-token',
			canopyBaseUrl: 'https://api.example.dev',
			coordinatorBaseUrl: 'https://coordinator.example.dev',
			agentWebhookUrl: 'https://agent.example/webhooks/delegation-required',
			mode: 'B',
			univocityAddr: 'cd'.repeat(20),
			chainId: '84532',
			forestR: FOREST_R,
			univocityVariant: 'uups-counterfactual',
			univocityDeployer: deployerHex,
			fetchImpl,
			modeB: {
				rootSignerAddress: WALLET_ADDRESS,
				userSignerUrl: 'https://user-signer.example/v1/sign',
				keyRef: 'user-remote'
			}
		});

		expect(result.coordinator).toEqual(coordinator);
		expect(postedBody).toBeDefined();
		const map = intKeyMap(postedBody!);
		expect(map.get(-68016)).toBe('uups-counterfactual');
		expect(map.get(-68017)).toEqual(new Uint8Array(20).fill(0xef));
		expect(map.get(-68010)).toBeDefined();
	});
});
