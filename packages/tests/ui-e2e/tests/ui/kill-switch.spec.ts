import { expect, test } from '@playwright/test';
import { loginWithMockPrivy } from '../../fixtures/privy-login.js';
import { installCoordinatorMocks } from '../../mocks/coordinator-bff.js';
import { E2E_AUTH_LOG_ID, E2E_USER_LOG_ID } from '../../mocks/fixtures.js';

test('pause and resume signing updates via mocked enabled endpoint', async ({ page }) => {
	await installCoordinatorMocks(page, {});
	await page.goto(`/delegations?authLogId=${encodeURIComponent(E2E_AUTH_LOG_ID)}`);
	await loginWithMockPrivy(page);
	await page.getByPlaceholder('User log UUID or 32-char hex').fill(E2E_USER_LOG_ID);
	await page.getByRole('button', { name: 'Pause signing' }).first().click();
	await expect(page.getByText('Signing paused for log', { exact: false })).toBeVisible();
	await page.getByRole('button', { name: 'Resume signing' }).click();
	await expect(page.getByText('Signing resumed for log', { exact: false })).toBeVisible();
});
