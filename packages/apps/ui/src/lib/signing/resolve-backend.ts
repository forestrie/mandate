import { env } from '$env/dynamic/public';
import type { SigningBackend } from './signing-backend.js';
import { PrivyEoaBackend } from './privy-eoa-backend.js';

export type SignerBackendKind = 'privy' | 'burner' | 'safe';

/** Operator's connect-time choice, held for the browser session only. */
const SESSION_SELECTION_KEY = 'mandate.session.signerBackend';

/**
 * Deploy-time DEFAULT signing backend (plan-2607-01 D1, FOR-322; demoted from
 * build-wide binary to session default by plan-2607-45 slice 03). Read from
 * `$env/dynamic/public` so a blank/missing `PUBLIC_MANDATE_SIGNER_BACKEND`
 * (or any unrecognised value) cleanly falls back to `privy` — production never
 * accidentally ships the burner path, and an unset var is not a build error.
 */
export function getConfiguredSignerBackend(): SignerBackendKind {
	const raw = env.PUBLIC_MANDATE_SIGNER_BACKEND?.trim().toLowerCase();
	if (raw === 'burner') return 'burner';
	if (raw === 'safe') return 'safe';
	return 'privy';
}

/**
 * Backends the operator may select this session. Burner is only on offer when
 * the deployment configured it — the "NEVER burner for live" guard stays a
 * deploy-time property; a stray stored selection cannot resurrect it.
 */
export function getSelectableSignerBackends(): SignerBackendKind[] {
	const options: SignerBackendKind[] = ['privy', 'safe'];
	if (getConfiguredSignerBackend() === 'burner') options.push('burner');
	return options;
}

/**
 * Session-scoped backend selection (plan-2607-45 slice 03): the operator picks
 * "Privy" vs "External wallet + Safe" at connect time; the env var is only the
 * default. Persisted in sessionStorage so navigation between console surfaces
 * keeps the choice, dropped when the tab closes.
 */
export function getSessionSignerBackend(): SignerBackendKind {
	if (typeof sessionStorage !== 'undefined') {
		const stored = sessionStorage.getItem(SESSION_SELECTION_KEY);
		if (
			(stored === 'privy' || stored === 'burner' || stored === 'safe') &&
			getSelectableSignerBackends().includes(stored)
		) {
			return stored;
		}
	}
	return getConfiguredSignerBackend();
}

/** Record the operator's choice for this session; `null` reverts to the default. */
export function setSessionSignerBackend(kind: SignerBackendKind | null): void {
	if (typeof sessionStorage === 'undefined') return;
	if (kind === null) {
		sessionStorage.removeItem(SESSION_SELECTION_KEY);
		return;
	}
	if (!getSelectableSignerBackends().includes(kind)) {
		throw new Error(`signing backend '${kind}' is not selectable on this deployment`);
	}
	sessionStorage.setItem(SESSION_SELECTION_KEY, kind);
}

export function isBurnerBackend(): boolean {
	return getSessionSignerBackend() === 'burner';
}

/**
 * Resolve the session's backend. The burner and Safe backends are loaded via
 * dynamic `import()` so each lands in its own lazily-fetched chunk rather than
 * the main bundle when the session runs Privy. (A stricter build-time guard
 * that drops the burner chunk entirely is a verification follow-up — see plan
 * Guardrails.)
 */
export async function resolveSigningBackend(): Promise<SigningBackend> {
	const kind = getSessionSignerBackend();
	if (kind === 'burner') {
		const { LocalBurnerBackend } = await import('./local-burner-backend.js');
		return new LocalBurnerBackend();
	}
	if (kind === 'safe') {
		const { SafeBackend } = await import('./safe-backend.js');
		return new SafeBackend();
	}
	return new PrivyEoaBackend();
}
