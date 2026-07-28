import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockEnv: Record<string, string | undefined> = {};
vi.mock('$env/dynamic/public', () => ({ env: mockEnv }));

const INSTANCE = `eip155:84532:0x${'ab'.repeat(20)}`;
const BASE = 'https://api-a.forest-2.forestrie.dev';

type FetchStub = ReturnType<typeof vi.fn>;

function stubFetch(response: Response): FetchStub {
	const stub = vi.fn(async () => response);
	vi.stubGlobal('fetch', stub);
	return stub;
}

function jsonResponse(body: unknown, status: number, headers?: Record<string, string>): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json', ...headers }
	});
}

beforeEach(() => {
	mockEnv.PUBLIC_CANOPY_API_URL = BASE;
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('canopyApiBase', () => {
	it('is a call-time error when unconfigured, not a build error', async () => {
		const { canopyApiBase } = await import('./canopy-client.js');
		mockEnv.PUBLIC_CANOPY_API_URL = undefined;
		expect(() => canopyApiBase()).toThrow(/PUBLIC_CANOPY_API_URL/);
		mockEnv.PUBLIC_CANOPY_API_URL = `${BASE}/`;
		expect(canopyApiBase()).toBe(BASE);
	});
});

describe('fetchFeeAccount', () => {
	it('requests JSON with the read Authorization and returns the body', async () => {
		const { fetchFeeAccount } = await import('./canopy-client.js');
		const body = {
			univocityInstanceId: INSTANCE,
			creditsBalance: 5,
			checkpointsAccrued: 2,
			arrears: 'current',
			enforcementFrozen: false,
			watermarkBlock: null
		};
		const stub = stubFetch(jsonResponse(body, 200));
		const read = await fetchFeeAccount(INSTANCE, 'Forestrie-Account-Read abc');
		expect(read).toEqual(body);
		const [url, init] = stub.mock.calls[0] as [string, RequestInit];
		expect(url).toBe(`${BASE}/api/payments/accounts/${encodeURIComponent(INSTANCE)}`);
		expect(init.headers).toMatchObject({
			Accept: 'application/json',
			Authorization: 'Forestrie-Account-Read abc'
		});
	});

	it('maps problem-details detail into the thrown error', async () => {
		const { fetchFeeAccount, CanopyRequestError } = await import('./canopy-client.js');
		stubFetch(jsonResponse({ title: 'Forbidden', detail: 'attestation rejected: expired' }, 403));
		const failure = fetchFeeAccount(INSTANCE, 'Forestrie-Account-Read abc');
		await expect(failure).rejects.toThrow('attestation rejected: expired');
		await expect(failure).rejects.toBeInstanceOf(CanopyRequestError);
	});
});

describe('requestCreditsChallenge', () => {
	it('returns the snapshot-bound quote from a 402 challenge', async () => {
		const { requestCreditsChallenge } = await import('./canopy-client.js');
		const stub = stubFetch(
			jsonResponse({ univocityInstanceId: INSTANCE, credits: 100, amountAtomic: '1000000' }, 402, {
				'X-PAYMENT-REQUIRED': 'b64challenge'
			})
		);
		const challenge = await requestCreditsChallenge(INSTANCE, 100);
		expect(challenge).toEqual({
			univocityInstanceId: INSTANCE,
			credits: 100,
			amountAtomic: '1000000',
			paymentRequiredB64: 'b64challenge'
		});
		const [url, init] = stub.mock.calls[0] as [string, RequestInit];
		expect(url).toBe(`${BASE}/api/payments/credits/${encodeURIComponent(INSTANCE)}?credits=100`);
		expect(init.method).toBe('POST');
	});

	it('rejects a 402 with no challenge header', async () => {
		const { requestCreditsChallenge } = await import('./canopy-client.js');
		stubFetch(jsonResponse({ credits: 100, amountAtomic: '1000000' }, 402));
		await expect(requestCreditsChallenge(INSTANCE, 100)).rejects.toThrow(
			/missing X-PAYMENT-REQUIRED/
		);
	});

	it("maps the credits route's plain {error} bodies (409 unregistered)", async () => {
		const { requestCreditsChallenge } = await import('./canopy-client.js');
		stubFetch(jsonResponse({ error: 'complete genesis before purchasing credits' }, 409));
		await expect(requestCreditsChallenge(INSTANCE, 100)).rejects.toThrow(
			/complete genesis before purchasing/
		);
	});
});

describe('submitCreditsPayment', () => {
	it('sends X-PAYMENT and accepts exactly a 202', async () => {
		const { submitCreditsPayment } = await import('./canopy-client.js');
		const accepted = {
			univocityInstanceId: INSTANCE,
			credits: 100,
			amountAtomic: '1000000',
			settlement: 'enqueued'
		};
		const stub = stubFetch(jsonResponse(accepted, 202));
		expect(await submitCreditsPayment(INSTANCE, 100, 'b64payment')).toEqual(accepted);
		const [, init] = stub.mock.calls[0] as [string, RequestInit];
		expect(init.headers).toMatchObject({ 'X-PAYMENT': 'b64payment' });
	});

	it('surfaces a re-challenge (402 on submit) as an error, never as success', async () => {
		const { submitCreditsPayment } = await import('./canopy-client.js');
		stubFetch(
			jsonResponse(
				{ credits: 100, amountAtomic: '1000000', reason: 'authorization already used' },
				402
			)
		);
		await expect(submitCreditsPayment(INSTANCE, 100, 'b64payment')).rejects.toThrow();
	});
});
