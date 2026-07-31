import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	applyDeployPlan,
	applyGenesisResult,
	applyProposalResult,
	approvalCopy,
	classifyRedeemFailure,
	clearProgress,
	deployPlanSafeGuard,
	deriveStep,
	emptyProgress,
	ensureForestR,
	loadProgress,
	normalizeUnivocityAddrInput,
	parseInstanceIndex,
	pinnedSafeGuard,
	repairFailureCopy,
	saveProgress,
	scrubProgressSecrets,
	useDeployedInstance,
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

	it('a redeemed status without a stored token lands on redeem — canopy re-issues a fresh token for the valid code (plan-2607-46 slice 02)', () => {
		const p = details();
		p.requestId = 'req-1';
		p.requestStatus = 'redeemed';
		expect(deriveStep(p)).toBe('redeem');
	});
});

describe('pinnedSafeGuard', () => {
	const pinned = `0x${'ab'.repeat(20)}`;

	it('passes before anything is pinned and on a case-insensitive match', () => {
		expect(pinnedSafeGuard(details(), `0x${'cd'.repeat(20)}`)).toBeNull();
		const p = { ...details(), safeAddress: pinned };
		expect(pinnedSafeGuard(p, pinned.toUpperCase().replace(/^0X/, '0x'))).toBeNull();
	});

	it('refuses a different or missing connected Safe, naming the attested one', () => {
		const p = { ...details(), safeAddress: pinned };
		const other = `0x${'ee'.repeat(20)}`;
		expect(pinnedSafeGuard(p, other)).toMatch(new RegExp(`attested by Safe ${pinned}`));
		expect(pinnedSafeGuard(p, other)).toContain(other);
		expect(pinnedSafeGuard(p, undefined)).toMatch(/Reconnect and validate that Safe/);
	});
});

describe('ensureForestR', () => {
	it('chooses R exactly once — the caller persists before genesis, retries re-use it', () => {
		const p = details();
		expect(ensureForestR(p, () => 'r-1')).toBe(true);
		expect(p.forestR).toBe('r-1');
		expect(ensureForestR(p, () => 'r-2')).toBe(false);
		expect(p.forestR).toBe('r-1');
	});
});

describe('applyGenesisResult', () => {
	it('records identifiers and treats anything but publicRoot ok as unregistered', () => {
		const p = details();
		applyGenesisResult(p, {
			logIdHex32: 'a'.repeat(32),
			univocityInstanceId: 'eip155:84532:0xcd',
			genesis: { coordinator: { publicRoot: 'ok' } }
		});
		expect(p.logIdHex32).toBe('a'.repeat(32));
		expect(p.univocityInstanceId).toBe('eip155:84532:0xcd');
		expect(p.publicRootRegistered).toBe(true);

		applyGenesisResult(p, {
			logIdHex32: 'a'.repeat(32),
			univocityInstanceId: 'eip155:84532:0xcd',
			genesis: { coordinator: { publicRoot: 'error' } }
		});
		expect(p.publicRootRegistered).toBe(false);
		applyGenesisResult(p, {
			logIdHex32: 'a'.repeat(32),
			univocityInstanceId: 'eip155:84532:0xcd',
			genesis: {}
		});
		expect(p.publicRootRegistered).toBe(false);
	});
});

describe('classifyRedeemFailure', () => {
	it('only the 410 expiry is terminal', () => {
		expect(classifyRedeemFailure(410)).toEqual({
			message: expect.stringMatching(/expired.*Start over/s),
			terminal: true
		});
		expect(classifyRedeemFailure(409).terminal).toBe(false);
		expect(classifyRedeemFailure(409).message).toMatch(/retry Redeem/);
		expect(classifyRedeemFailure(503).terminal).toBe(false);
		expect(classifyRedeemFailure(undefined).terminal).toBe(false);
	});

	it('retryable copy says re-redeeming is safe and surfaces the server detail', () => {
		expect(classifyRedeemFailure(undefined).message).toMatch(/re-issues the token/);
		expect(classifyRedeemFailure(500, 'boom upstream').message).toContain('boom upstream');
	});
});

describe('repairFailureCopy', () => {
	it('distinguishes token expiry (ops can finish out-of-band) from retry-shortly', () => {
		expect(repairFailureCopy(401)).toMatch(/token has expired/);
		expect(repairFailureCopy(401)).toMatch(/already registered/);
		expect(repairFailureCopy(401)).toMatch(/does not need the onboard token/);
		expect(repairFailureCopy(undefined)).toMatch(/Retry shortly/);
	});
});

describe('scrubProgressSecrets', () => {
	it('drops the credentials but keeps identifiers, leaving the wizard at done', () => {
		const p = details();
		p.requestId = 'req-1';
		p.redeemCode = 'rc';
		p.onboardToken = 'token';
		p.forestR = 'r-1';
		p.logIdHex32 = 'a'.repeat(32);
		p.univocityInstanceId = 'eip155:84532:0xcd';
		p.signingRouteSet = true;
		scrubProgressSecrets(p);
		expect(p.redeemCode).toBeUndefined();
		expect(p.onboardToken).toBeUndefined();
		expect(p.requestId).toBe('req-1');
		expect(p.forestR).toBe('r-1');
		expect(deriveStep(p)).toBe('done');
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

describe('deploy branch state (plan-2607-47 slice 02)', () => {
	const SAFE = '0xCdD289cC5420529d1C4D0498FA3DaAb549A07a63';
	const plan = () => ({
		safeAddress: SAFE,
		releaseTag: 'v0.1.8',
		instanceIndex: 0,
		salt: `0x${'ab'.repeat(32)}`,
		predictedAddress: `0x${'12'.repeat(20)}`
	});

	it('parseInstanceIndex accepts small non-negative integers only', () => {
		expect(parseInstanceIndex('0')).toBe(0);
		expect(parseInstanceIndex(' 3 ')).toBe(3);
		expect(parseInstanceIndex('-1')).toBeNull();
		expect(parseInstanceIndex('1.5')).toBeNull();
		expect(parseInstanceIndex('')).toBeNull();
		expect(parseInstanceIndex('nope')).toBeNull();
	});

	it('applyDeployPlan keeps a recorded proposal only while the prediction is unchanged', () => {
		const p = details();
		applyDeployPlan(p, plan());
		applyProposalResult(p, { safeTxHash: `0x${'99'.repeat(32)}`, proposed: true });
		// Same salt + prediction (re-verify on resume): the proposal survives.
		applyDeployPlan(p, plan());
		expect(p.deploy?.safeTxHash).toBe(`0x${'99'.repeat(32)}`);
		expect(p.deploy?.proposed).toBe(true);
		// A different prediction (index bump) invalidates it — the old SafeTx
		// deploys a different address.
		applyDeployPlan(p, {
			...plan(),
			instanceIndex: 1,
			salt: `0x${'cd'.repeat(32)}`,
			predictedAddress: `0x${'34'.repeat(20)}`
		});
		expect(p.deploy?.safeTxHash).toBeUndefined();
		expect(p.deploy?.proposed).toBeUndefined();
		expect(p.deploy?.instanceIndex).toBe(1);
	});

	it('applyProposalResult records best-effort STS outcomes', () => {
		const p = details();
		applyDeployPlan(p, plan());
		applyProposalResult(p, { safeTxHash: `0x${'99'.repeat(32)}`, proposed: false });
		expect(p.deploy?.safeTxHash).toBe(`0x${'99'.repeat(32)}`);
		expect(p.deploy?.proposed).toBe(false);
	});

	it('deployPlanSafeGuard refuses a Safe other than the one the salt is bound to', () => {
		const p = details();
		expect(deployPlanSafeGuard(p, SAFE)).toBeNull();
		applyDeployPlan(p, plan());
		expect(deployPlanSafeGuard(p, SAFE)).toBeNull();
		expect(deployPlanSafeGuard(p, SAFE.toLowerCase())).toBeNull();
		expect(deployPlanSafeGuard(p, `0x${'34'.repeat(20)}`)).toMatch(/different instance/);
		expect(deployPlanSafeGuard(p, undefined)).toMatch(/Reconnect and validate/);
	});

	it('useDeployedInstance adopts the predicted address as the wizard input', () => {
		const p = details();
		p.univocityAddr = '';
		useDeployedInstance(p);
		expect(p.univocityAddr).toBe('');
		applyDeployPlan(p, plan());
		useDeployedInstance(p);
		expect(p.univocityAddr).toBe(`0x${'12'.repeat(20)}`);
	});

	it('deploy state round-trips persistence and never advances the step machine', () => {
		const p = details();
		applyDeployPlan(p, plan());
		expect(deriveStep(p)).toBe('details');
		saveProgress(p);
		expect(loadProgress().deploy).toEqual(p.deploy);
		clearProgress();
	});
});
