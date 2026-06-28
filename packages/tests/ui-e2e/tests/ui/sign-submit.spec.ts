import { expect, test } from '@playwright/test';
import { loadPending, loginWithMockPrivy } from '../../fixtures/privy-login.js';
import { installCoordinatorMocks } from '../../mocks/coordinator-bff.js';
import { E2E_AUTH_LOG_ID, samplePendingEntry } from '../../mocks/fixtures.js';

test('sign and submit posts certificate to mocked BFF', async ({ page }) => {
	let submitted = false;
	const pendingEntries = [samplePendingEntry()];
	await installCoordinatorMocks(page, {
		pendingEntries,
		onCertificateSubmit: () => {
			submitted = true;
		}
	});
	await page.goto(`/delegations?authLogId=${encodeURIComponent(E2E_AUTH_LOG_ID)}`);
	await loginWithMockPrivy(page);
	await loadPending(page);
	await page.getByRole('button', { name: 'Sign & submit' }).click();
	await expect(page.locator('tbody').getByText('Submitted')).toBeVisible({ timeout: 15_000 });
	expect(submitted).toBe(true);
});
