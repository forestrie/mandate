import { expect, test, type Page } from '@playwright/test';
import {
	E2E_EMAIL,
	E2E_OTP,
	E2E_UNIVOCITY_INSTANCE_ID,
	installCanopyPaymentsMocks
} from '@forestrie/mandate-ui-e2e-kit';

/** The fees page carries its own sign-in card (no delegations detour). */
async function loginOnFeesPage(page: Page): Promise<void> {
	await page.getByPlaceholder('operator@example.com').fill(E2E_EMAIL);
	await page.getByRole('button', { name: 'Send code' }).click();
	await page.getByPlaceholder('One-time code').fill(E2E_OTP);
	await page.getByRole('button', { name: 'Sign in' }).click();
}

async function openFeesLoggedIn(page: Page): Promise<void> {
	await page.goto(`/fees?instance=${encodeURIComponent(E2E_UNIVOCITY_INSTANCE_ID)}`);
	await loginOnFeesPage(page);
	await page.getByRole('button', { name: 'Load' }).click();
}

test('fee account renders from the attested read', async ({ page }) => {
	await installCanopyPaymentsMocks(page, { initialBalance: 42 });
	await openFeesLoggedIn(page);

	await expect(page.getByText('Sealing active')).toBeVisible();
	await expect(page.getByText('Checkpoints accrued')).toBeVisible();
	await expect(page.getByText('Block 998877')).toBeVisible();
	// current posture is quiet — no arrears badge.
	await expect(page.getByText('In arrears')).toHaveCount(0);
});

test('credits purchase: quote, sign, 202, poll until landed', async ({ page }) => {
	const state = await installCanopyPaymentsMocks(page, { initialBalance: 0 });
	await openFeesLoggedIn(page);
	await expect(page.getByText('Sealing active')).toBeVisible();

	await page.getByRole('button', { name: 'Get quote' }).click();
	// 100 credits × $0.01 = $1.00 — the quoted price the payer must sign.
	await expect(page.getByText('$1.00')).toBeVisible();

	await page.getByRole('button', { name: 'Sign & pay' }).click();
	await expect(page.getByText(/Payment accepted/)).toBeVisible();
	expect(state.purchases).toEqual([{ credits: 100, amountAtomic: '1000000' }]);

	// Credits land on a later read (mock settles on next poll tick, 10 s).
	await expect(page.getByText('Credits landed: balance is now 100.')).toBeVisible({
		timeout: 20_000
	});
});

test('frozen account surfaces the kill-switch alarm', async ({ page }) => {
	await installCanopyPaymentsMocks(page, {
		initialBalance: 0,
		enforcementFrozen: true,
		arrears: 'in-arrears'
	});
	await openFeesLoggedIn(page);

	await expect(page.getByText('Sealing frozen')).toBeVisible();
	await expect(page.getByText('In arrears')).toBeVisible();
	await expect(page.getByText('Sealing is frozen')).toBeVisible();
});
