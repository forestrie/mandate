import { expect, test } from '@playwright/test';
import { loadPending, loginWithMockPrivy } from '../../fixtures/privy-login.js';
import { installCoordinatorMocks } from '../../mocks/coordinator-bff.js';
import { E2E_AUTH_LOG_ID, samplePendingEntries } from '../../mocks/fixtures.js';

test('renders pending rows from mocked BFF', async ({ page }) => {
	const pendingEntries = samplePendingEntries(2);
	await installCoordinatorMocks(page, { pendingEntries });
	await page.goto(`/delegations?authLogId=${encodeURIComponent(E2E_AUTH_LOG_ID)}`);
	await loginWithMockPrivy(page);
	await loadPending(page);
	await expect(page.getByRole('button', { name: 'Sign & submit' })).toHaveCount(2);
});

test('empty pending list shows empty state copy', async ({ page }) => {
	await installCoordinatorMocks(page, { pendingEntries: [] });
	await page.goto(`/delegations?authLogId=${encodeURIComponent(E2E_AUTH_LOG_ID)}`);
	await loginWithMockPrivy(page);
	await loadPending(page);
	await expect(page.getByText('No pending entries for this authority log.')).toBeVisible();
});
