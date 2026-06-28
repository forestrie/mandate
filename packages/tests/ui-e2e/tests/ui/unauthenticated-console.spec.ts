import { expect, loadPending, test } from '../../fixtures/app.js';

test('shows login affordance before wallet connect', async ({ consolePage: page }) => {
	await expect(page.getByPlaceholder('Email for Privy login')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Send code' })).toBeVisible();
});

test('load pending without login keeps login affordance', async ({ consolePage: page }) => {
	await loadPending(page);
	await expect(page.getByPlaceholder('Email for Privy login')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Send code' })).toBeVisible();
});
