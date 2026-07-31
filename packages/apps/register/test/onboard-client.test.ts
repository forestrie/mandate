import { describe, expect, it, vi } from 'vitest';
import {
	getOnboardRequestStatus,
	OnboardPaymentRequiredError,
	OnboardRedeemError,
	redeemOnboardToken,
	requestOnboardToken
} from '../src/onboard-client.js';

describe('onboard-client', () => {
	it('requestOnboardToken posts CBOR create body', async () => {
		const { encodeCborDeterministic: encode } = await import('@forestrie/encoding');
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

	it('carries the attestation as untagged bytes at CBOR key 7 (FOR-484)', async () => {
		const { decodeCborDeterministic: decode, encodeCborDeterministic: encode } =
			await import('@forestrie/encoding');
		const attestation = new Uint8Array([0x84, 0x41, 0x01, 0xa0, 0x41, 0x02, 0x41, 0x03]);
		let sent: Uint8Array | undefined;
		const fetchImpl = (async (_url: RequestInfo | URL, init?: RequestInit) => {
			sent = new Uint8Array(init?.body as unknown as Uint8Array);
			return new Response(
				new Uint8Array(
					encode({ requestId: 'id-2', status: 'pending', expiresAt: 9, redeemCode: 'rc' })
				) as unknown as BodyInit,
				{ status: 201 }
			);
		}) as typeof fetch;

		await requestOnboardToken({
			canopyBaseUrl: 'https://api.test',
			label: 'fork',
			chainId: '84532',
			univocityAddr: `0x${'ab'.repeat(20)}`,
			contactEmail: 'a@b.com',
			attestation,
			fetchImpl
		});

		// canopy's strict decoder surfaces cbor-x tags as opaque CborTag and
		// would drop (tag 64) or 400 (tag 259) the request — pin tag-free.
		const hex = Buffer.from(sent!).toString('hex');
		expect(hex).not.toContain('d90103');
		expect(hex).not.toContain('d840');
		const body = decode(sent!) as Map<number, unknown>;
		expect(body.get(3)).toBe('ab'.repeat(20));
		expect(new Uint8Array(body.get(7) as Uint8Array)).toEqual(attestation);
	});

	it('redeemOnboardToken returns token', async () => {
		const { encodeCborDeterministic: encode } = await import('@forestrie/encoding');
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

	it('redeemOnboardToken sends the X-PAYMENT header when a payment is supplied (FOR-511)', async () => {
		const { encodeCborDeterministic: encode } = await import('@forestrie/encoding');
		let sentHeaders: Headers | undefined;
		const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
			sentHeaders = new Headers(init?.headers);
			return new Response(new Uint8Array(encode({ token: 'tok-paid' })), {
				status: 200,
				headers: { 'Content-Type': 'application/cbor' }
			});
		});

		const token = await redeemOnboardToken({
			canopyBaseUrl: 'https://api.test',
			requestId: 'id-1',
			redeemCode: 'rc',
			paymentHeader: 'cGF5bG9hZA==',
			fetchImpl
		});
		expect(token).toBe('tok-paid');
		expect(sentHeaders?.get('X-PAYMENT')).toBe('cGF5bG9hZA==');
	});

	it('redeemOnboardToken omits X-PAYMENT without a payment', async () => {
		const { encodeCborDeterministic: encode } = await import('@forestrie/encoding');
		let sentHeaders: Headers | undefined;
		const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
			sentHeaders = new Headers(init?.headers);
			return new Response(new Uint8Array(encode({ token: 'tok' })), {
				status: 200,
				headers: { 'Content-Type': 'application/cbor' }
			});
		});
		await redeemOnboardToken({
			canopyBaseUrl: 'https://api.test',
			requestId: 'id-1',
			redeemCode: 'rc',
			fetchImpl
		});
		expect(sentHeaders?.has('X-PAYMENT')).toBe(false);
	});

	it('redeemOnboardToken surfaces a 402 challenge as OnboardPaymentRequiredError', async () => {
		const fetchImpl = vi.fn(
			async () =>
				new Response('Payment required to redeem this onboard request', {
					status: 402,
					headers: { 'X-PAYMENT-REQUIRED': 'Y2hhbGxlbmdl' }
				})
		);
		const err = await redeemOnboardToken({
			canopyBaseUrl: 'https://api.test',
			requestId: 'id-1',
			redeemCode: 'rc',
			fetchImpl
		}).catch((e: unknown) => e);
		expect(err).toBeInstanceOf(OnboardPaymentRequiredError);
		// It IS an OnboardRedeemError too — existing catch sites keep working.
		expect(err).toBeInstanceOf(OnboardRedeemError);
		const typed = err as OnboardPaymentRequiredError;
		expect(typed.status).toBe(402);
		expect(typed.challengeB64).toBe('Y2hhbGxlbmdl');
		expect(typed.detail).toContain('Payment required');
	});

	it('a 402 without the challenge header stays a plain OnboardRedeemError', async () => {
		const fetchImpl = vi.fn(async () => new Response('nope', { status: 402 }));
		const err = await redeemOnboardToken({
			canopyBaseUrl: 'https://api.test',
			requestId: 'id-1',
			redeemCode: 'rc',
			fetchImpl
		}).catch((e: unknown) => e);
		expect(err).toBeInstanceOf(OnboardRedeemError);
		expect(err).not.toBeInstanceOf(OnboardPaymentRequiredError);
	});

	it('getOnboardRequestStatus polls status', async () => {
		const { encodeCborDeterministic: encode } = await import('@forestrie/encoding');
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
