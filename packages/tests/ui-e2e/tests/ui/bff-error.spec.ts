import { expect, test } from '@playwright/test';
import { loadPending, loginWithMockPrivy } from '../../fixtures/privy-login.js';
import { installCoordinatorMocks } from '../../mocks/coordinator-bff.js';
import { E2E_AUTH_LOG_ID } from '../../mocks/fixtures.js';

test('surfaces BFF 403 problem detail without crashing', async ({ page }) => {
	await installCoordinatorMocks(page, {
		pendingError: {
			type: 'about:blank',
			title: 'Forbidden',
			status: 403,
			detail: 'e2e-mock-forbidden'
		}
	});
	await page.goto(`/delegations?authLogId=${encodeURIComponent(E2E_AUTH_LOG_ID)}`);
	await loginWithMockPrivy(page);
	await loadPending(page);
	await expect(page.getByText('e2e-mock-forbidden')).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Delegation console' })).toBeVisible();
});
