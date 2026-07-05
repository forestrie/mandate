import type { Page } from '@playwright/test';

/**
 * Deploy-time / system-test burner-key seeding (plan-2607-01 D2, FOR-322).
 * Mirrors how a system-test deployment pre-populates `localStorage` with a
 * key minted out of band, so the operator/user starts already in control of
 * `K(L)` and the exit gradient can run non-interactively.
 */

/** Must match `BURNER_KEY_STORAGE_KEY` in `@mandate/ui` local-burner-key.ts. */
export const BURNER_KEY_STORAGE_KEY = 'mandate.burner.privateKey';

/** Fixed secp256k1 test key (scalar = 1); never used for anything real. */
export const E2E_BURNER_PRIVATE_KEY =
	'0x0000000000000000000000000000000000000000000000000000000000000001';

/** Address derived from `E2E_BURNER_PRIVATE_KEY` (well-known scalar-1 EOA). */
export const E2E_BURNER_ADDRESS = '0x7e5f4552091a69125d5dfcb7b8c2659029395bdf';

/**
 * Seed the burner key into `localStorage` before any page script runs, so the
 * delegation console loads already holding the key (no "Create burner" click).
 * Registers an init script for every subsequent navigation on this page.
 */
export async function seedBurnerKey(
	page: Page,
	privateKeyHex: string = E2E_BURNER_PRIVATE_KEY
): Promise<void> {
	await page.addInitScript(
		([storageKey, key]) => {
			window.localStorage.setItem(storageKey, key);
		},
		[BURNER_KEY_STORAGE_KEY, privateKeyHex] as const
	);
}
