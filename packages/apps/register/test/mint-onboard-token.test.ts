import {
	decodeCborDeterministic as decodeCbor,
	encodeCborDeterministic as encodeCbor
} from '@forestrie/encoding';
import { describe, expect, it } from 'vitest';
import { mintOnboardToken } from '../src/mint-onboard-token.js';

const ADDR = 'ab'.repeat(20);
const INSTANCE_ID = `eip155:84532:0x${ADDR}`;

describe('mintOnboardToken (ADR-0059 D8: bindings mandatory)', () => {
	it('sends the mandatory chain binding (int keys 3/4) and returns the scoped result', async () => {
		let sent: Map<number, unknown> | undefined;
		const fetchImpl = (async (_url: RequestInfo | URL, init?: RequestInit) => {
			sent = decodeCbor(new Uint8Array(init?.body as unknown as Uint8Array)) as Map<
				number,
				unknown
			>;
			return new Response(
				encodeCbor({
					token: 'tok-1',
					ref: 'ff'.repeat(32),
					univocityInstanceId: INSTANCE_ID
				}) as unknown as BodyInit,
				{ status: 201 }
			);
		}) as typeof fetch;

		const minted = await mintOnboardToken({
			canopyBaseUrl: 'https://api.example.dev',
			opsAdminToken: 'ops',
			chainId: '84532',
			// 0x prefix and checksum case must normalise to bare lowercase hex.
			univocityAddr: `0x${'AB'.repeat(20)}`,
			label: 'spec',
			fetchImpl
		});

		expect(sent?.get(1)).toBe('spec');
		expect(sent?.get(3)).toBe('84532');
		expect(sent?.get(4)).toBe(ADDR);
		expect(minted.token).toBe('tok-1');
		expect(minted.ref).toBe('ff'.repeat(32));
		expect(minted.univocityInstanceId).toBe(INSTANCE_ID);
	});

	it('surfaces a reservation conflict as MintOnboardTokenConflictError (canopy revoked the token)', async () => {
		const fetchImpl = (async () =>
			new Response('already reserved', { status: 409 })) as typeof fetch;
		await expect(
			mintOnboardToken({
				canopyBaseUrl: 'https://api.example.dev',
				opsAdminToken: 'ops',
				chainId: '84532',
				univocityAddr: ADDR,
				fetchImpl
			})
		).rejects.toMatchObject({
			name: 'MintOnboardTokenConflictError',
			univocityInstanceId: INSTANCE_ID
		});
	});

	it('rejects a malformed binding before any network call', async () => {
		const fetchImpl = (async () => {
			throw new Error('must not fetch');
		}) as typeof fetch;
		await expect(
			mintOnboardToken({
				canopyBaseUrl: 'https://api.example.dev',
				opsAdminToken: 'ops',
				chainId: '0x14a34',
				univocityAddr: ADDR,
				fetchImpl
			})
		).rejects.toMatchObject({ name: 'UnivocityInstanceIdError' });
	});
});
