import {
	decodeCborDeterministic as decodeCbor,
	encodeCborDeterministic as encodeCbor
} from '@forestrie/encoding';
import { describe, expect, it, vi } from 'vitest';
import { provisionModeDGenesis } from '../src/provision-mode-d.js';
import { ReservationConflictError } from '../src/reservation-conflict-error.js';
import {
	FOREST_GENESIS_LABEL_BOOTSTRAP_KEY,
	FOREST_GENESIS_LABEL_CHAIN_ID,
	FOREST_GENESIS_LABEL_GENESIS_ALG,
	FOREST_GENESIS_LABEL_UNIVOCITY_ADDR
} from '../src/forest-genesis-labels.js';

const FOREST_R = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const LOG_ID = 'a1b2c3d4e5f67890abcdef1234567890';
const SAFE_ADDRESS = `0x${'5a'.repeat(20)}`;
const UNIVOCITY_ADDR = 'cd'.repeat(20);
const COSE_ALG_KS256 = -65799;

function genesisResponse(): Response {
	return new Response(
		encodeCbor({
			R: FOREST_R,
			chainBinding: { chainId: '84532', univocityAddr: UNIVOCITY_ADDR },
			coordinator: { publicRoot: 'ok', webhook: 'skipped' }
		}) as unknown as BodyInit,
		{ status: 201 }
	);
}

describe('provisionModeDGenesis (browser-safe Mode D)', () => {
	it('posts an unsigned genesis with the Safe address as bootstrapKey and no webhookUrl', async () => {
		let requestedUrl = '';
		let requestBody: Uint8Array | undefined;
		const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			requestedUrl = String(input);
			requestBody = init?.body as Uint8Array;
			return genesisResponse();
		});

		const result = await provisionModeDGenesis({
			onboardToken: 'onboard-token',
			canopyBaseUrl: 'https://api.example.dev',
			univocityAddr: `0x${UNIVOCITY_ADDR}`,
			chainId: '84532',
			safeAddress: SAFE_ADDRESS,
			forestR: FOREST_R,
			fetchImpl
		});

		expect(requestedUrl).toContain(`/api/forest/${FOREST_R}/genesis`);
		// Mode D registers no agent webhook: an interactive root signs in the
		// console, so the pending queue is the delivery surface.
		expect(requestedUrl).not.toContain('webhookUrl');

		const body = decodeCbor(requestBody!) as Map<number, unknown>;
		expect(body.get(FOREST_GENESIS_LABEL_GENESIS_ALG)).toBe(COSE_ALG_KS256);
		expect(body.get(FOREST_GENESIS_LABEL_CHAIN_ID)).toBe('84532');
		expect(new Uint8Array(body.get(FOREST_GENESIS_LABEL_BOOTSTRAP_KEY) as Uint8Array)).toEqual(
			Uint8Array.from({ length: 20 }, () => 0x5a)
		);
		expect(new Uint8Array(body.get(FOREST_GENESIS_LABEL_UNIVOCITY_ADDR) as Uint8Array)).toEqual(
			Uint8Array.from({ length: 20 }, () => 0xcd)
		);

		expect(result.forestR).toBe(FOREST_R);
		expect(result.logIdHex32).toBe(LOG_ID);
		expect(result.univocityInstanceId).toBe(`eip155:84532:0x${UNIVOCITY_ADDR}`);
		expect(result.genesis.coordinator).toEqual({ publicRoot: 'ok', webhook: 'skipped' });

		const descriptor = result.descriptors.operatorRootKeys[LOG_ID];
		expect(descriptor).toEqual({
			alg: 'KS256',
			rootSignerAddress: SAFE_ADDRESS,
			kind: 'interactive'
		});
	});

	it('maps a 409 genesis conflict to ReservationConflictError naming the instance', async () => {
		const fetchImpl = vi.fn(
			async () => new Response('instance already reserved by a foreign admission', { status: 409 })
		);

		const attempt = provisionModeDGenesis({
			onboardToken: 'onboard-token',
			canopyBaseUrl: 'https://api.example.dev',
			univocityAddr: UNIVOCITY_ADDR,
			chainId: '84532',
			safeAddress: SAFE_ADDRESS,
			forestR: FOREST_R,
			fetchImpl
		});

		await expect(attempt).rejects.toThrow(ReservationConflictError);
		await expect(attempt).rejects.toMatchObject({
			univocityInstanceId: `eip155:84532:0x${UNIVOCITY_ADDR}`
		});
	});
});
