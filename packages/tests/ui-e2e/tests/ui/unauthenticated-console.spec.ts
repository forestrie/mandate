import { expect, loadPending, test } from '@forestrie/mandate-ui-e2e-kit';

test('shows login affordance before wallet connect', async ({ consolePage: page }) => {
	await expect(page.getByPlaceholder('Email for Privy login')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Send code' })).toBeVisible();
});

test('load pending without login keeps login affordance', async ({ consolePage: page }) => {
	await loadPending(page);
	await expect(page.getByPlaceholder('Email for Privy login')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Send code' })).toBeVisible();
});
