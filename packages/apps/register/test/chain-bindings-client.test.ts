import { encodeCborDeterministic as encodeCbor } from '@forestrie/encoding';
import { describe, expect, it } from 'vitest';
import { getChainBinding, releaseChainBinding } from '../src/chain-bindings-client.js';

const INSTANCE_ID = `eip155:84532:0x${'ab'.repeat(20)}`;

const OPTS = {
	canopyBaseUrl: 'https://api.example.dev/',
	opsAdminToken: 'ops',
	univocityInstanceId: INSTANCE_ID
};

describe('chain-bindings ops client (D7 recovery surface)', () => {
	it('GET decodes the reservation record, registrationBlock included', async () => {
		const record = {
			univocityInstanceId: INSTANCE_ID,
			state: 'registered',
			holder: 'request:req-1',
			reservedAt: 1785184978,
			r: '9d56cbce-6f14-2bf3-c523-58c52a643d5c',
			registrationBlock: 44708346
		};
		const fetchImpl = (async (url: RequestInfo | URL, init?: RequestInit) => {
			expect(String(url)).toBe(
				`https://api.example.dev/api/payments/chain-bindings/${encodeURIComponent(INSTANCE_ID)}`
			);
			expect(init?.method).toBe('GET');
			return new Response(encodeCbor(record) as unknown as BodyInit, { status: 200 });
		}) as typeof fetch;

		const got = await getChainBinding({ ...OPTS, fetchImpl });
		expect(got?.state).toBe('registered');
		expect(got?.registrationBlock).toBe(44708346);
	});

	it('GET returns null when no claim exists', async () => {
		const fetchImpl = (async () => new Response('not found', { status: 404 })) as typeof fetch;
		expect(await getChainBinding({ ...OPTS, fetchImpl })).toBeNull();
	});

	it('DELETE returns the released record and null when nothing was held', async () => {
		const released = { state: 'reserved', holder: 'token:ff', reservedAt: 1, released: true };
		let method: string | undefined;
		const fetchImpl = (async (_url: RequestInfo | URL, init?: RequestInit) => {
			method = init?.method;
			return new Response(encodeCbor(released) as unknown as BodyInit, { status: 200 });
		}) as typeof fetch;
		const got = await releaseChainBinding({ ...OPTS, fetchImpl });
		expect(method).toBe('DELETE');
		expect(got?.state).toBe('reserved');

		const gone = (async () => new Response('not found', { status: 404 })) as typeof fetch;
		expect(await releaseChainBinding({ ...OPTS, fetchImpl: gone })).toBeNull();
	});

	it('throws on unexpected status', async () => {
		const fetchImpl = (async () => new Response('nope', { status: 401 })) as typeof fetch;
		await expect(getChainBinding({ ...OPTS, fetchImpl })).rejects.toThrow(/401/);
	});
});
