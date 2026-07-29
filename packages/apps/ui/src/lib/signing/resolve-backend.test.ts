import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mutable stand-in for $env/dynamic/public; PrivyEoaBackend stubbed so importing
// the factory doesn't pull the real Privy client ($env/static/public) chain.
const mockEnv: Record<string, string | undefined> = {};
vi.mock('$env/dynamic/public', () => ({ env: mockEnv }));
vi.mock('./privy-eoa-backend.js', () => ({ PrivyEoaBackend: class PrivyEoaBackendStub {} }));

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

beforeEach(() => {
	for (const key of Object.keys(mockEnv)) delete mockEnv[key];
	vi.stubGlobal('sessionStorage', new MemoryStorage());
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('getConfiguredSignerBackend', () => {
	it('defaults to privy when the var is unset', async () => {
		const { getConfiguredSignerBackend, isBurnerBackend } = await import('./resolve-backend.js');
		expect(getConfiguredSignerBackend()).toBe('privy');
		expect(isBurnerBackend()).toBe(false);
	});

	it('falls back to privy for blank or unknown values (fail-safe)', async () => {
		const { getConfiguredSignerBackend } = await import('./resolve-backend.js');
		for (const value of ['', '  ', 'privy', 'BURNERX', 'true', 'metamask']) {
			mockEnv.PUBLIC_MANDATE_SIGNER_BACKEND = value;
			expect(getConfiguredSignerBackend()).toBe('privy');
		}
	});

	it('selects burner or safe only for an exact (trim + case-insensitive) match', async () => {
		const { getConfiguredSignerBackend, isBurnerBackend } = await import('./resolve-backend.js');
		for (const value of ['burner', 'BURNER', '  Burner  ']) {
			mockEnv.PUBLIC_MANDATE_SIGNER_BACKEND = value;
			expect(getConfiguredSignerBackend()).toBe('burner');
			expect(isBurnerBackend()).toBe(true);
		}
		for (const value of ['safe', 'SAFE', '  Safe  ']) {
			mockEnv.PUBLIC_MANDATE_SIGNER_BACKEND = value;
			expect(getConfiguredSignerBackend()).toBe('safe');
		}
	});
});

describe('session-scoped selection (plan-2607-45 slice 03)', () => {
	it('the env value is only the default; a session pick overrides it', async () => {
		const { getSessionSignerBackend, setSessionSignerBackend } =
			await import('./resolve-backend.js');
		expect(getSessionSignerBackend()).toBe('privy');
		setSessionSignerBackend('safe');
		expect(getSessionSignerBackend()).toBe('safe');
		setSessionSignerBackend(null);
		expect(getSessionSignerBackend()).toBe('privy');
	});

	it('never resurrects burner on a deployment that did not configure it', async () => {
		const { getSessionSignerBackend, setSessionSignerBackend, getSelectableSignerBackends } =
			await import('./resolve-backend.js');
		expect(getSelectableSignerBackends()).toEqual(['privy', 'safe']);
		expect(() => setSessionSignerBackend('burner')).toThrow(/not selectable/);
		// Even a hand-planted stored value is ignored.
		sessionStorage.setItem('mandate.session.signerBackend', 'burner');
		expect(getSessionSignerBackend()).toBe('privy');
	});

	it('offers burner on a burner-configured deployment and honours the pick', async () => {
		mockEnv.PUBLIC_MANDATE_SIGNER_BACKEND = 'burner';
		const { getSessionSignerBackend, setSessionSignerBackend, getSelectableSignerBackends } =
			await import('./resolve-backend.js');
		expect(getSelectableSignerBackends()).toEqual(['privy', 'safe', 'burner']);
		expect(getSessionSignerBackend()).toBe('burner');
		setSessionSignerBackend('safe');
		expect(getSessionSignerBackend()).toBe('safe');
	});
});
