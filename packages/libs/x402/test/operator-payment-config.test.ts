import { describe, expect, it } from 'vitest';
import {
	PaymentConfigError,
	isPaymentConfigured,
	resolveOperatorPaymentConfig,
	type OperatorPaymentEnv
} from '../src/index.js';

/**
 * FOR-428 requirement 1 — fail closed with no configured payee.
 *
 * The failure this guards against is specific: a forked operator deploys, does
 * not configure a payee, and a compiled-in fallback quietly settles their
 * customers' money to upstream's treasury. There must be no such fallback, and
 * an unconfigured deployment must refuse rather than guess.
 */

/** Fully configured, for isolating one missing field at a time. */
const COMPLETE: OperatorPaymentEnv = {
	X402_PAYTO_ADDRESS: '0x1111111111111111111111111111111111111111',
	X402_PRICE_ATOMIC: '250000',
	X402_NETWORK: 'eip155:8453',
	X402_ASSET_ADDRESS: '0x2222222222222222222222222222222222222222',
	X402_FACILITATOR_URL: 'https://facilitator.example/'
};

describe('resolveOperatorPaymentConfig — fail closed', () => {
	it('throws when nothing at all is configured', () => {
		expect(() => resolveOperatorPaymentConfig({})).toThrow(PaymentConfigError);
	});

	it('names the missing payee and offers no default', () => {
		let thrown: unknown;
		try {
			resolveOperatorPaymentConfig({});
		} catch (error) {
			thrown = error;
		}
		expect(thrown).toBeInstanceOf(PaymentConfigError);
		expect((thrown as Error).message).toContain('X402_PAYTO_ADDRESS');
		expect((thrown as Error).message).toContain('no default');
	});

	// Each economic/chain field individually. A fallback on any one of them is
	// a way to settle to the wrong place or at the wrong price.
	const required = [
		'X402_PAYTO_ADDRESS',
		'X402_PRICE_ATOMIC',
		'X402_NETWORK',
		'X402_ASSET_ADDRESS',
		'X402_FACILITATOR_URL'
	] as const;

	for (const field of required) {
		it(`throws when ${field} is absent`, () => {
			const env = { ...COMPLETE };
			delete env[field];
			expect(() => resolveOperatorPaymentConfig(env)).toThrow(new RegExp(field));
		});

		it(`throws when ${field} is empty`, () => {
			expect(() => resolveOperatorPaymentConfig({ ...COMPLETE, [field]: '' })).toThrow(
				PaymentConfigError
			);
		});

		it(`throws when ${field} is whitespace only`, () => {
			expect(() => resolveOperatorPaymentConfig({ ...COMPLETE, [field]: '   ' })).toThrow(
				PaymentConfigError
			);
		});
	}

	it('resolves to exactly the configured values — nothing is substituted', () => {
		const config = resolveOperatorPaymentConfig(COMPLETE);
		expect(config.payTo).toBe(COMPLETE.X402_PAYTO_ADDRESS);
		expect(config.priceAtomic).toBe(COMPLETE.X402_PRICE_ATOMIC);
		expect(config.network).toBe(COMPLETE.X402_NETWORK);
		expect(config.asset).toBe(COMPLETE.X402_ASSET_ADDRESS);
		expect(config.facilitatorUrl).toBe(COMPLETE.X402_FACILITATOR_URL);
	});

	it('trims surrounding whitespace', () => {
		const config = resolveOperatorPaymentConfig({
			...COMPLETE,
			X402_PAYTO_ADDRESS: `  ${COMPLETE.X402_PAYTO_ADDRESS}  `
		});
		expect(config.payTo).toBe(COMPLETE.X402_PAYTO_ADDRESS);
	});

	it('carries no upstream address anywhere in the module source', async () => {
		// A regression guard with teeth: canopy's defect was a literal address in
		// source (ADR-0058). Assert this module contains no 0x-address literal at
		// all, so the fallback cannot come back by copy-paste.
		const { readFile } = await import('node:fs/promises');
		const source = await readFile(
			new URL('../src/operator-payment-config.ts', import.meta.url),
			'utf8'
		);
		expect(source).not.toMatch(/0x[0-9a-fA-F]{40}/);
	});
});

describe('isPaymentConfigured', () => {
	it('is false for an operator that has configured nothing', () => {
		expect(isPaymentConfigured({})).toBe(false);
	});

	it('is false when only the payee is set', () => {
		expect(isPaymentConfigured({ X402_PAYTO_ADDRESS: COMPLETE.X402_PAYTO_ADDRESS })).toBe(false);
	});

	it('is true when fully configured', () => {
		expect(isPaymentConfigured(COMPLETE)).toBe(true);
	});
});

describe('ERC-20 EIP-712 domain metadata', () => {
	it('defaults to the ERC-20 convention (not economic configuration)', () => {
		const config = resolveOperatorPaymentConfig(COMPLETE);
		expect(config.assetEip712Name).toBe('USDC');
		expect(config.assetEip712Version).toBe('2');
	});

	it('is overridable for assets that differ', () => {
		const config = resolveOperatorPaymentConfig({
			...COMPLETE,
			X402_ASSET_EIP712_NAME: 'EURC',
			X402_ASSET_EIP712_VERSION: '1'
		});
		expect(config.assetEip712Name).toBe('EURC');
		expect(config.assetEip712Version).toBe('1');
	});
});
