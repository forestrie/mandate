import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	approvalCopy,
	clearProgress,
	deriveStep,
	emptyProgress,
	loadProgress,
	normalizeUnivocityAddrInput,
	saveProgress,
	validateDetails,
	type OnboardProgress
} from './onboard-state.js';

function details(): OnboardProgress {
	return {
		chainId: '84532',
		univocityAddr: 'cd'.repeat(20),
		label: 'dev instance',
		contactEmail: 'ops@example.com'
	};
}

describe('deriveStep', () => {
	it('walks the wizard in order as progress accrues', () => {
		const p = details();
		expect(deriveStep(p)).toBe('details');
		p.requestId = 'req-1';
		p.requestStatus = 'pending';
		expect(deriveStep(p)).toBe('awaiting-approval');
		p.requestStatus = 'approved';
		expect(deriveStep(p)).toBe('redeem');
		p.onboardToken = 'token';
		expect(deriveStep(p)).toBe('genesis');
		p.logIdHex32 = 'a1b2c3d4e5f67890abcdef1234567890';
		expect(deriveStep(p)).toBe('signing-route');
		p.signingRouteSet = true;
		expect(deriveStep(p)).toBe('done');
	});

	it('rejected/expired are terminal regardless of later fields', () => {
		const p = details();
		p.requestId = 'req-1';
		p.requestStatus = 'rejected';
		expect(deriveStep(p)).toBe('failed');
		p.requestStatus = 'expired';
		expect(deriveStep(p)).toBe('failed');
	});

	it('a redeemed status without a stored token still lands on redeem (idempotent resume)', () => {
		const p = details();
		p.requestId = 'req-1';
		p.requestStatus = 'redeemed';
		expect(deriveStep(p)).toBe('redeem');
	});
});

class MemoryStorage {
	private map = new Map<string, string>();
	getItem(key: string) {
		return this.map.has(key) ? this.map.get(key)! : null;
	}
	setItem(key: string, value: string) {
		this.map.set(key, value);
	}
	removeItem(key: string) {
		this.map.delete(key);
	}
}

describe('progress persistence', () => {
	beforeEach(() => {
		vi.stubGlobal('sessionStorage', new MemoryStorage());
		clearProgress();
	});

	it('round-trips through sessionStorage and tolerates junk', () => {
		expect(loadProgress()).toEqual(emptyProgress());
		const p = details();
		p.requestId = 'req-1';
		p.forestR = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
		saveProgress(p);
		expect(loadProgress()).toEqual({ ...emptyProgress(), ...p });

		sessionStorage.setItem('mandate.session.onboard', 'not json');
		expect(loadProgress()).toEqual(emptyProgress());
	});
});

describe('input validation', () => {
	it('normalizes univocity addresses to bare lowercase 40-hex', () => {
		expect(normalizeUnivocityAddrInput(` 0x${'CD'.repeat(20)} `)).toBe('cd'.repeat(20));
		expect(normalizeUnivocityAddrInput('cd'.repeat(20))).toBe('cd'.repeat(20));
		expect(normalizeUnivocityAddrInput('0x1234')).toBeNull();
		expect(normalizeUnivocityAddrInput('')).toBeNull();
	});

	it('validateDetails names the first offending field', () => {
		expect(validateDetails(details())).toBeNull();
		expect(validateDetails({ ...details(), chainId: 'base' })).toMatch(/Chain id/);
		expect(validateDetails({ ...details(), univocityAddr: '0xnope' })).toMatch(/Univocity/);
		expect(validateDetails({ ...details(), label: '  ' })).toMatch(/Label/);
		expect(validateDetails({ ...details(), contactEmail: 'nope' })).toMatch(/email/);
	});
});

describe('approvalCopy', () => {
	it('is honest about the out-of-band approval while pending', () => {
		expect(approvalCopy('pending')).toMatch(/out of band/);
		expect(approvalCopy(undefined)).toMatch(/out of band/);
		expect(approvalCopy('approved')).toMatch(/redeem/i);
		expect(approvalCopy('rejected')).toMatch(/rejected/);
		expect(approvalCopy('expired')).toMatch(/expired/);
	});
});
