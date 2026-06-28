import { expect, test } from '@playwright/test';

const E2E_AUTH_LOG_ID = '11111111-1111-1111-1111-111111111111';

test('home page navigates to delegation console with auth log id', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByRole('heading', { name: 'Delegation wallet console' })).toBeVisible();
	await page.getByPlaceholder('Auth log UUID or 32-char hex').fill(E2E_AUTH_LOG_ID);
	await page.getByRole('button', { name: 'Open console' }).click();
	await expect(page).toHaveURL(new RegExp(`/delegations\\?authLogId=${E2E_AUTH_LOG_ID}`));
	await expect(page.getByRole('heading', { name: 'Delegation console' })).toBeVisible();
});
