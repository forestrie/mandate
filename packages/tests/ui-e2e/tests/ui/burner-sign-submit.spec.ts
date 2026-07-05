import { expect, test } from '@playwright/test';
import {
	E2E_AUTH_LOG_ID,
	installCoordinatorMocks,
	loadPending,
	samplePendingEntry,
	seedBurnerKey
} from '@forestrie/mandate-ui-e2e-kit';

// Requires the UI served with PUBLIC_MANDATE_SIGNER_BACKEND=burner
// (playwright.burner.config.ts). Hermetic: coordinator BFF is mocked, no Privy,
// no live sealing/checkpoint pipeline.
test('burner backend signs and submits without Privy', async ({ page }) => {
	let submitted = false;
	await installCoordinatorMocks(page, {
		pendingEntries: [samplePendingEntry()],
		onCertificateSubmit: () => {
			submitted = true;
		}
	});
	// Deploy-seed the key before the app loads — no "Create burner" click needed.
	await seedBurnerKey(page);
	await page.goto(`/delegations?authLogId=${encodeURIComponent(E2E_AUTH_LOG_ID)}`);

	// Burner mode is active and the seeded key is in control — no Privy login card.
	await expect(page.getByRole('heading', { name: 'Burner wallet' })).toBeVisible();
	await expect(page.getByPlaceholder('Email for Privy login')).toHaveCount(0);

	await loadPending(page);
	await page.getByRole('button', { name: 'Sign & submit' }).click();
	await expect(page.locator('tbody').getByText('Submitted')).toBeVisible({ timeout: 15_000 });
	expect(submitted).toBe(true);
});
