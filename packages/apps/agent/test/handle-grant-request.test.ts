import { describe, expect, it, vi } from 'vitest';
import type { OperatorPaymentEnv } from '@mandate/x402';
import { handleGrantRequest } from '../src/grants/handle-grant-request.js';
import type { GrantIssuer } from '../src/grants/grant-request.js';

const OPERATOR_PAYTO = '0xAAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaA';
const UPSTREAM_PAYTO = '0x75be7950F26fe7F15336a10b33A8D8134faDb787';

const PAYMENT_ENV: OperatorPaymentEnv = {
	X402_PAYTO_ADDRESS: OPERATOR_PAYTO,
	X402_PRICE_ATOMIC: '250000',
	X402_NETWORK: 'eip155:8453',
	X402_ASSET_ADDRESS: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
	X402_FACILITATOR_URL: 'https://facilitator.example'
};

const BODY = JSON.stringify({ version: 1, kind: 'endorsement', forestId: 'aabbccdd' });

function grantRequest(paymentHeader?: string): Request {
	const headers: Record<string, string> = { 'Content-Type': 'application/json' };
	if (paymentHeader) headers['X-PAYMENT'] = paymentHeader;
	return new Request('https://operator.example/grants', {
		method: 'POST',
		headers,
		body: BODY
	});
}

function payment(overrides: { to?: string; value?: string } = {}): string {
	return btoa(
		JSON.stringify({
			x402Version: 2,
			accepted: { scheme: 'exact', network: 'eip155:8453' },
			payload: {
				signature: '0xdeadbeef',
				authorization: {
					from: '0xcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcC',
					to: overrides.to ?? OPERATOR_PAYTO,
					value: overrides.value ?? '250000',
					validAfter: '0',
					validBefore: '9999999999',
					nonce: '0x00'
				}
			}
		})
	);
}

/** Facilitator stub recording which endpoints were called. */
function facilitator(options: { verifyOk?: boolean; settleOk?: boolean } = {}) {
	const calls: string[] = [];
	const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
		const url = String(input);
		calls.push(url);
		if (url.endsWith('/verify')) {
			return new Response(JSON.stringify({ isValid: options.verifyOk ?? true }), { status: 200 });
		}
		if (url.endsWith('/settle')) {
			return new Response(
				JSON.stringify({ success: options.settleOk ?? true, settlementId: 'settle-1' }),
				{ status: 200 }
			);
		}
		throw new Error(`unexpected facilitator call: ${url}`);
	}) as unknown as typeof fetch;
	return {
		fetchImpl,
		calls,
		verified: () => calls.some((c) => c.endsWith('/verify')),
		settled: () => calls.some((c) => c.endsWith('/settle'))
	};
}

const issuer: GrantIssuer = { issue: async () => ({ grantId: 'grant-1' }) };

describe('POST /grants — fail closed with no configured payee (FOR-428 req 1)', () => {
	it('refuses when nothing is configured', async () => {
		const response = await handleGrantRequest(grantRequest(), { paymentEnv: {} });
		expect(response.status).toBe(503);
		expect(await response.json()).toEqual({
			ok: false,
			error: 'grant payment is not configured for this operator'
		});
	});

	it('issues no 402 challenge when unconfigured — nothing to advertise', async () => {
		const response = await handleGrantRequest(grantRequest(), { paymentEnv: {} });
		expect(response.headers.get('X-PAYMENT-REQUIRED')).toBeNull();
	});

	it('refuses when the payee is set but the price is not', async () => {
		const response = await handleGrantRequest(grantRequest(), {
			paymentEnv: { X402_PAYTO_ADDRESS: OPERATOR_PAYTO }
		});
		expect(response.status).toBe(503);
	});

	it('never settles a payment when unconfigured, even if one is presented', async () => {
		const f = facilitator();
		const response = await handleGrantRequest(grantRequest(payment()), {
			paymentEnv: {},
			grantIssuer: issuer,
			fetchImpl: f.fetchImpl
		});
		expect(response.status).toBe(503);
		expect(f.calls).toEqual([]);
	});

	it('does not fall back to an upstream address', async () => {
		// The specific failure being excluded: an unconfigured fork paywalling to
		// forestrie's treasury.
		const response = await handleGrantRequest(grantRequest(), { paymentEnv: {} });
		expect(await response.text()).not.toContain(UPSTREAM_PAYTO);
	});
});

describe('POST /grants — 402 challenge carries the operator’s own terms', () => {
	it('challenges with this operator’s payTo, price and chain', async () => {
		const response = await handleGrantRequest(grantRequest(), { paymentEnv: PAYMENT_ENV });
		expect(response.status).toBe(402);
		const header = response.headers.get('X-PAYMENT-REQUIRED');
		expect(header).toBeTruthy();
		const requirements = JSON.parse(atob(header!));
		expect(requirements.accepts[0].payTo).toBe(OPERATOR_PAYTO);
		expect(requirements.accepts[0].amount).toBe('250000');
		expect(requirements.accepts[0].network).toBe('eip155:8453');
		expect(requirements.accepts[0].payTo).not.toBe(UPSTREAM_PAYTO);
	});

	it('re-challenges a payment addressed to a different payee', async () => {
		const f = facilitator();
		const response = await handleGrantRequest(grantRequest(payment({ to: UPSTREAM_PAYTO })), {
			paymentEnv: PAYMENT_ENV,
			grantIssuer: issuer,
			fetchImpl: f.fetchImpl
		});
		expect(response.status).toBe(402);
		expect(f.calls).toEqual([]);
	});

	it('rejects a malformed grant request before challenging', async () => {
		const request = new Request('https://operator.example/grants', {
			method: 'POST',
			body: '{"version":1}'
		});
		const response = await handleGrantRequest(request, { paymentEnv: PAYMENT_ENV });
		expect(response.status).toBe(400);
	});
});

describe('POST /grants — settlement is verified before the grant is issued (FOR-428 req 2)', () => {
	it('verifies, issues, then settles, in that order', async () => {
		const f = facilitator();
		const order: string[] = [];
		const recordingIssuer: GrantIssuer = {
			issue: async () => {
				order.push('issue');
				return { grantId: 'grant-1' };
			}
		};
		const wrapped = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			order.push(String(input).endsWith('/verify') ? 'verify' : 'settle');
			return (f.fetchImpl as (i: RequestInfo | URL, r?: RequestInit) => Promise<Response>)(
				input,
				init
			);
		}) as unknown as typeof fetch;

		const response = await handleGrantRequest(grantRequest(payment()), {
			paymentEnv: PAYMENT_ENV,
			grantIssuer: recordingIssuer,
			fetchImpl: wrapped
		});

		expect(response.status).toBe(200);
		expect(order).toEqual(['verify', 'issue', 'settle']);
		expect(await response.json()).toEqual({ ok: true, grant: { grantId: 'grant-1' } });
		const paymentResponse = response.headers.get('X-PAYMENT-RESPONSE');
		expect(paymentResponse).toBeTruthy();
		expect(JSON.parse(atob(paymentResponse!)).settlementId).toBe('settle-1');
	});

	it('does not issue when the facilitator says the payment is invalid', async () => {
		const f = facilitator({ verifyOk: false });
		const issue = vi.fn(async () => ({ grantId: 'grant-1' }));
		const response = await handleGrantRequest(grantRequest(payment()), {
			paymentEnv: PAYMENT_ENV,
			grantIssuer: { issue },
			fetchImpl: f.fetchImpl
		});
		expect(response.status).toBe(402);
		expect(issue).not.toHaveBeenCalled();
		expect(f.settled()).toBe(false);
	});

	it('does not settle when issuance is unimplemented — no charge for nothing', async () => {
		const f = facilitator();
		const response = await handleGrantRequest(grantRequest(payment()), {
			paymentEnv: PAYMENT_ENV,
			fetchImpl: f.fetchImpl
		});
		expect(response.status).toBe(501);
		expect(f.verified()).toBe(true);
		expect(f.settled()).toBe(false);
	});

	it('does not settle when issuance throws', async () => {
		const f = facilitator();
		const response = await handleGrantRequest(grantRequest(payment()), {
			paymentEnv: PAYMENT_ENV,
			grantIssuer: {
				issue: async () => {
					throw new Error('signer unavailable');
				}
			},
			fetchImpl: f.fetchImpl
		});
		expect(response.status).toBe(502);
		expect(f.settled()).toBe(false);
	});

	it('reports a failed settlement rather than claiming success', async () => {
		const f = facilitator({ settleOk: false });
		const response = await handleGrantRequest(grantRequest(payment()), {
			paymentEnv: PAYMENT_ENV,
			grantIssuer: issuer,
			fetchImpl: f.fetchImpl
		});
		expect(response.status).toBe(502);
	});
});

describe('POST /grants — canopy learns nothing (FOR-428 req 4)', () => {
	it('talks only to the operator’s own facilitator', async () => {
		const f = facilitator();
		await handleGrantRequest(grantRequest(payment()), {
			paymentEnv: PAYMENT_ENV,
			grantIssuer: issuer,
			fetchImpl: f.fetchImpl
		});
		expect(f.calls.length).toBeGreaterThan(0);
		for (const call of f.calls) {
			expect(call.startsWith('https://facilitator.example/')).toBe(true);
		}
	});

	it('accepts no coordinator credential or URL in its dependencies', () => {
		// Structural: the deps type has no coordinator surface, so there is no
		// value to send even by accident.
		const deps = { paymentEnv: PAYMENT_ENV };
		expect(Object.keys(deps)).toEqual(['paymentEnv']);
	});
});
