import { describe, expect, it } from 'vitest';
import type { FeeAccountRead } from '$lib/payments/canopy-client.js';
import {
	creditsLanded,
	enforcementBadge,
	formatUsdcAtomic,
	hasArrears,
	parseCreditsInput,
	registrationBlockLabel
} from './fee-account-state.js';

const BASE: FeeAccountRead = {
	univocityInstanceId: `eip155:84532:0x${'ab'.repeat(20)}`,
	creditsBalance: 42,
	checkpointsAccrued: 7,
	arrears: '0',
	enforcementFrozen: false,
	watermarkBlock: 123456
};

describe('enforcementBadge', () => {
	it('marks frozen as the alarming state', () => {
		expect(enforcementBadge(BASE)).toMatchObject({ label: 'Sealing active', alarming: false });
		expect(enforcementBadge({ ...BASE, enforcementFrozen: true })).toMatchObject({
			label: 'Sealing frozen',
			alarming: true
		});
	});
});

describe('hasArrears', () => {
	it('treats zero as clear and positive decimal strings as owing', () => {
		expect(hasArrears(BASE)).toBe(false);
		expect(hasArrears({ ...BASE, arrears: '0.25' })).toBe(true);
		expect(hasArrears({ ...BASE, arrears: '3' })).toBe(true);
	});
});

describe('registrationBlockLabel (tri-state, plan-2607-07 R2)', () => {
	it('distinguishes absent (legacy) from null (repair pending) from a block', () => {
		expect(registrationBlockLabel(BASE)).toBe('Legacy record (no registration floor)');
		expect(registrationBlockLabel({ ...BASE, registrationBlock: null })).toBe(
			'Not observed — ops repair pending'
		);
		expect(registrationBlockLabel({ ...BASE, registrationBlock: 998877 })).toBe('Block 998877');
	});
});

describe('formatUsdcAtomic', () => {
	it('renders 6-decimal atomic USDC as dollars', () => {
		expect(formatUsdcAtomic('1000000')).toBe('$1.00');
		expect(formatUsdcAtomic('10000')).toBe('$0.01');
		expect(formatUsdcAtomic('1234567')).toBe('$1.23');
		expect(formatUsdcAtomic('0')).toBe('$0.00');
	});
	it('passes through non-numeric input unchanged', () => {
		expect(formatUsdcAtomic('n/a')).toBe('n/a');
	});
});

describe('parseCreditsInput', () => {
	it('accepts canopy bounds 1..100000 and rejects everything else', () => {
		expect(parseCreditsInput('100')).toBe(100);
		expect(parseCreditsInput(' 1 ')).toBe(1);
		expect(parseCreditsInput('100000')).toBe(100000);
		expect(parseCreditsInput('0')).toBeNull();
		expect(parseCreditsInput('100001')).toBeNull();
		expect(parseCreditsInput('-5')).toBeNull();
		expect(parseCreditsInput('1.5')).toBeNull();
		expect(parseCreditsInput('abc')).toBeNull();
		expect(parseCreditsInput('')).toBeNull();
	});
});

describe('creditsLanded', () => {
	it('fires only when the balance strictly increases', () => {
		expect(creditsLanded(BASE, { ...BASE, creditsBalance: 43 })).toBe(true);
		expect(creditsLanded(BASE, BASE)).toBe(false);
		expect(creditsLanded(BASE, { ...BASE, creditsBalance: 41 })).toBe(false);
	});
});
