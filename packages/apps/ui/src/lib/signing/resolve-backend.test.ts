import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mutable stand-in for $env/dynamic/public; PrivyEoaBackend stubbed so importing
// the factory doesn't pull the real Privy client ($env/static/public) chain.
const mockEnv: Record<string, string | undefined> = {};
vi.mock('$env/dynamic/public', () => ({ env: mockEnv }));
vi.mock('./privy-eoa-backend.js', () => ({ PrivyEoaBackend: class PrivyEoaBackendStub {} }));

beforeEach(() => {
	for (const key of Object.keys(mockEnv)) delete mockEnv[key];
});

describe('getConfiguredSignerBackend', () => {
	it('defaults to privy when the var is unset', async () => {
		const { getConfiguredSignerBackend, isBurnerBackend } = await import('./resolve-backend.js');
		expect(getConfiguredSignerBackend()).toBe('privy');
		expect(isBurnerBackend()).toBe(false);
	});

	it('falls back to privy for blank or unknown values (fail-safe)', async () => {
		const { getConfiguredSignerBackend } = await import('./resolve-backend.js');
		for (const value of ['', '  ', 'safe', 'privy', 'BURNERX', 'true']) {
			mockEnv.PUBLIC_MANDATE_SIGNER_BACKEND = value;
			expect(getConfiguredSignerBackend()).toBe('privy');
		}
	});

	it('selects burner only for an exact (trim + case-insensitive) match', async () => {
		const { getConfiguredSignerBackend, isBurnerBackend } = await import('./resolve-backend.js');
		for (const value of ['burner', 'BURNER', '  Burner  ']) {
			mockEnv.PUBLIC_MANDATE_SIGNER_BACKEND = value;
			expect(getConfiguredSignerBackend()).toBe('burner');
			expect(isBurnerBackend()).toBe(true);
		}
	});
});
