import { describe, expect, it } from 'vitest';
import {
	buildPaymentRequirements,
	encodePaymentRequiredHeader,
	parsePaymentHeader,
	resolveOperatorPaymentConfig,
	type OperatorPaymentConfig
} from '../src/index.js';

const OPERATOR_PAYTO = '0xAAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaA';
const OTHER_PAYTO = '0xbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbB';

const config: OperatorPaymentConfig = resolveOperatorPaymentConfig({
	X402_PAYTO_ADDRESS: OPERATOR_PAYTO,
	X402_PRICE_ATOMIC: '250000',
	X402_NETWORK: 'eip155:8453',
	X402_ASSET_ADDRESS: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
	X402_FACILITATOR_URL: 'https://facilitator.example'
});

const resource = {
	url: 'https://mandate.example/grants',
	description: 'Forestrie endorsement grant',
	mimeType: 'application/json'
};

function paymentHeader(overrides: {
	to?: string;
	value?: string;
	network?: string;
	scheme?: string;
}): string {
	return btoa(
		JSON.stringify({
			x402Version: 2,
			accepted: {
				scheme: overrides.scheme ?? 'exact',
				network: overrides.network ?? config.network
			},
			payload: {
				signature: '0xdeadbeef',
				authorization: {
					from: '0xcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcC',
					to: overrides.to ?? OPERATOR_PAYTO,
					value: overrides.value ?? config.priceAtomic,
					validAfter: '0',
					validBefore: '9999999999',
					nonce: '0x00'
				}
			}
		})
	);
}

describe('402 challenge carries the operator’s own terms', () => {
	it('advertises this operator’s payTo, price, chain and asset', () => {
		const requirements = buildPaymentRequirements(config, resource);
		expect(requirements.x402Version).toBe(2);
		expect(requirements.accepts).toHaveLength(1);
		const option = requirements.accepts[0]!;
		expect(option.payTo).toBe(OPERATOR_PAYTO);
		expect(option.amount).toBe('250000');
		expect(option.network).toBe('eip155:8453');
		expect(option.asset).toBe('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913');
	});

	it('round-trips through the X-PAYMENT-REQUIRED header', () => {
		const requirements = buildPaymentRequirements(config, resource);
		const decoded = JSON.parse(atob(encodePaymentRequiredHeader(requirements)));
		expect(decoded.accepts[0].payTo).toBe(OPERATOR_PAYTO);
	});

	it('two forks with different configuration advertise different payees', () => {
		// The falsifiable form of "the fork collects its own fees": nothing is
		// shared between deployments but the code.
		const fork = resolveOperatorPaymentConfig({
			X402_PAYTO_ADDRESS: OTHER_PAYTO,
			X402_PRICE_ATOMIC: '999',
			X402_NETWORK: 'eip155:84532',
			X402_ASSET_ADDRESS: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
			X402_FACILITATOR_URL: 'https://other-facilitator.example'
		});
		const a = buildPaymentRequirements(config, resource).accepts[0]!;
		const b = buildPaymentRequirements(fork, resource).accepts[0]!;
		expect(a.payTo).not.toBe(b.payTo);
		expect(a.amount).not.toBe(b.amount);
		expect(a.network).not.toBe(b.network);
	});
});

describe('parsePaymentHeader binds the payment to this operator', () => {
	it('accepts a payment addressed to this operator at this price', () => {
		const result = parsePaymentHeader(paymentHeader({}), config);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value.payTo).toBe(OPERATOR_PAYTO);
			expect(result.value.amount).toBe('250000');
		}
	});

	it('rejects a payment addressed to a different payee', () => {
		const result = parsePaymentHeader(paymentHeader({ to: OTHER_PAYTO }), config);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toContain('authorization.to must be');
	});

	it('rejects a payment on a different chain', () => {
		const result = parsePaymentHeader(paymentHeader({ network: 'eip155:1' }), config);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toContain('network must be');
	});

	it('rejects underpayment', () => {
		const result = parsePaymentHeader(paymentHeader({ value: '1' }), config);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toContain('authorization.value must be');
	});

	it('rejects a non-exact scheme', () => {
		const result = parsePaymentHeader(paymentHeader({ scheme: 'upto' }), config);
		expect(result.ok).toBe(false);
	});

	it('rejects an absent header', () => {
		expect(parsePaymentHeader(null, config).ok).toBe(false);
	});

	it('rejects a malformed header', () => {
		expect(parsePaymentHeader('not-base64-@@@', config).ok).toBe(false);
	});
});
