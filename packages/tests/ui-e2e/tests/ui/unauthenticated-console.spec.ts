import { E2E_AUTH_LOG_ID, expect, loadPending, test } from '@forestrie/mandate-ui-e2e-kit';

test('shows login affordance before wallet connect', async ({ page }) => {
	await page.goto(`/delegations?authLogId=${encodeURIComponent(E2E_AUTH_LOG_ID)}`);
	await expect(page.getByRole('button', { name: 'Connect wallet' })).toBeVisible();
});

test('load pending without login keeps login affordance', async ({ page }) => {
	await page.goto(`/delegations?authLogId=${encodeURIComponent(E2E_AUTH_LOG_ID)}`);
	await loadPending(page);
	await expect(page.getByRole('button', { name: 'Connect wallet' })).toBeVisible();
});
