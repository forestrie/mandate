import { expect, test } from '@playwright/test';
import {
	E2E_AUTH_LOG_ID,
	installCoordinatorMocks,
	loadPending,
	loginWithMockPrivy,
	samplePendingEntry
} from '@forestrie/mandate-ui-e2e-kit';

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
