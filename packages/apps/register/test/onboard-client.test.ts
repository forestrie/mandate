import { describe, expect, it, vi } from 'vitest';
import {
	getOnboardRequestStatus,
	redeemOnboardToken,
	requestOnboardToken
} from '../src/onboard-client.js';

describe('onboard-client', () => {
	it('requestOnboardToken posts CBOR create body', async () => {
		const { encode } = await import('cbor-x');
		const fetchImpl = vi.fn(
			async () =>
				new Response(
					new Uint8Array(
						encode({ requestId: 'id-1', status: 'pending', expiresAt: 9, redeemCode: 'rc' })
					),
					{
						status: 201,
						headers: { 'Content-Type': 'application/cbor' }
					}
				)
		);

		const out = await requestOnboardToken({
			canopyBaseUrl: 'https://api.test',
			label: 'fork',
			chainId: '84532',
			univocityAddr: 'aa'.repeat(40),
			contactEmail: 'a@b.com',
			fetchImpl
		});

		expect(out.requestId).toBe('id-1');
		expect(out.redeemCode).toBe('rc');
		expect(fetchImpl).toHaveBeenCalledOnce();
	});

	it('redeemOnboardToken returns token', async () => {
		const { encode } = await import('cbor-x');
		const fetchImpl = vi.fn(
			async () =>
				new Response(new Uint8Array(encode({ token: 'tok-abc' })), {
					status: 200,
					headers: { 'Content-Type': 'application/cbor' }
				})
		);

		const token = await redeemOnboardToken({
			canopyBaseUrl: 'https://api.test',
			requestId: 'id-1',
			redeemCode: 'rc',
			fetchImpl
		});
		expect(token).toBe('tok-abc');
	});

	it('getOnboardRequestStatus polls status', async () => {
		const { encode } = await import('cbor-x');
		const fetchImpl = vi.fn(
			async () =>
				new Response(new Uint8Array(encode({ requestId: 'id-1', status: 'approved' })), {
					status: 200,
					headers: { 'Content-Type': 'application/cbor' }
				})
		);

		const out = await getOnboardRequestStatus('https://api.test', 'id-1', fetchImpl);
		expect(out.status).toBe('approved');
	});
});
