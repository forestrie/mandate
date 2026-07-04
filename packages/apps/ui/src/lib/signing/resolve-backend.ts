import { env } from '$env/dynamic/public';
import type { SigningBackend } from './signing-backend.js';
import { PrivyEoaBackend } from './privy-eoa-backend.js';

export type SignerBackendKind = 'privy' | 'burner';

/**
 * Deploy-time signing-backend selection (plan-2607-01 D1, FOR-322).
 * Read from `$env/dynamic/public` so a blank/missing `PUBLIC_MANDATE_SIGNER_BACKEND`
 * (or any unrecognised value) cleanly falls back to `privy` — production never
 * accidentally ships the burner path, and an unset var is not a build error.
 */
export function getConfiguredSignerBackend(): SignerBackendKind {
	return env.PUBLIC_MANDATE_SIGNER_BACKEND?.trim().toLowerCase() === 'burner' ? 'burner' : 'privy';
}

export function isBurnerBackend(): boolean {
	return getConfiguredSignerBackend() === 'burner';
}

/**
 * Resolve the configured backend. The burner backend is loaded via dynamic
 * `import()` so it lands in its own lazily-fetched chunk rather than the main
 * bundle when the deployment runs Privy. (A stricter build-time guard that
 * drops the chunk entirely is a verification follow-up — see plan Guardrails.)
 */
export async function resolveSigningBackend(): Promise<SigningBackend> {
	if (getConfiguredSignerBackend() === 'burner') {
		const { LocalBurnerBackend } = await import('./local-burner-backend.js');
		return new LocalBurnerBackend();
	}
	return new PrivyEoaBackend();
}
