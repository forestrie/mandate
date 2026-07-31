import { expect, test } from '@playwright/test';
import {
	E2E_INJECTED_OWNER_ADDRESS,
	E2E_SAFE_ADDRESS,
	E2E_UNIVOCITY_ADDR,
	E2E_X402_PAYTO,
	E2E_X402_USDC_ASSET,
	installCanopyOnboardingMocks,
	installCoordinatorMocks,
	installInjectedWalletMock,
	recordedTypedDataRequests
} from '@forestrie/mandate-ui-e2e-kit';

// USDC pay-to-approve at redeem (FOR-511): under `paid`/`either` admission a
// pending redeem answers 402 + X-PAYMENT-REQUIRED, and paying approves in the
// same call. The CTA price comes from the challenge — the specs pin that the
// signed amount IS the challenge amount, and that `vetted` deployments never
// show a pay option.

const PRICE_ATOMIC = '100000000'; // 100 USDC — the FOR-511 onboard price shape

async function submitOnboardRequest(page: import('@playwright/test').Page): Promise<void> {
	await page.goto('/onboard');
	await page.getByRole('button', { name: 'Connect E2E Wallet' }).click();
	await page.getByLabel('Safe address').fill(E2E_SAFE_ADDRESS);
	await page.getByRole('button', { name: 'Validate' }).click();
	await expect(page.getByText('Safe validated — 1-of-1, owner confirmed')).toBeVisible();
	await page.getByLabel('Univocity contract address').fill(E2E_UNIVOCITY_ADDR);
	await page.getByLabel('Label', { exact: true }).fill('e2e paid instance');
	await page.getByLabel('Contact email').fill('ops@example.com');
	await page.getByRole('button', { name: 'Sign attestation & request onboarding' }).click();
	await expect(page.getByText('Awaiting operator approval')).toBeVisible();
}

test('pay-to-approve: the challenge-quoted price is signed by the owner EOA and approves in one call', async ({
	page
}) => {
	await installCoordinatorMocks(page, {});
	const onboarding = await installCanopyOnboardingMocks(page, {
		payment: { priceAtomic: PRICE_ATOMIC }
	});
	await installInjectedWalletMock(page, { codeAddresses: [E2E_UNIVOCITY_ADDR] });

	await submitOnboardRequest(page);

	// The CTA quotes the price FROM the 402 challenge (never hardcoded) and
	// keeps the wait-for-ops path visible beside it.
	await expect(page.getByTestId('pay-to-approve')).toBeVisible();
	await expect(page.getByText(/\$100\.00 USDC/).first()).toBeVisible();
	await expect(page.getByText(/out of band/)).toBeVisible();

	await page.getByTestId('pay-approve-button').click();

	// Payment approved the request in the same redeem — straight to genesis.
	await expect(page.getByRole('heading', { name: 'Genesis' })).toBeVisible({ timeout: 15_000 });

	// The paid redeem carried an X-PAYMENT whose authorization matches the
	// challenge: amount, payee, and the owner EOA as payer.
	expect(onboarding.payments).toHaveLength(1);
	const payment = onboarding.payments[0]!;
	expect(payment.authorization.value).toBe(PRICE_ATOMIC);
	expect(payment.authorization.to.toLowerCase()).toBe(E2E_X402_PAYTO.toLowerCase());
	expect(payment.authorization.from.toLowerCase()).toBe(E2E_INJECTED_OWNER_ADDRESS);
	expect(payment.signature).toMatch(/^0x/);
	expect(payment.acceptedAmount).toBe(PRICE_ATOMIC);

	// The wallet signed a TransferWithAuthorization in USDC's own EIP-712
	// domain (the asset is the verifying contract), from the owner EOA — the
	// Safe never pays (Q9 posture).
	const typedData = await recordedTypedDataRequests(page);
	const transfers = typedData.filter((r) => r.primaryType === 'TransferWithAuthorization');
	expect(transfers).toHaveLength(1);
	expect(transfers[0]!.from.toLowerCase()).toBe(E2E_INJECTED_OWNER_ADDRESS);
	expect((transfers[0]!.domain.verifyingContract as string).toLowerCase()).toBe(
		E2E_X402_USDC_ASSET.toLowerCase()
	);
});

test('pay-to-approve: a facilitator reject keeps the request pending and a fresh payment succeeds', async ({
	page
}) => {
	await installCoordinatorMocks(page, {});
	const onboarding = await installCanopyOnboardingMocks(page, {
		payment: { priceAtomic: PRICE_ATOMIC, rejectPaidAttempts: 1 }
	});
	await installInjectedWalletMock(page, { codeAddresses: [E2E_UNIVOCITY_ADDR] });

	await submitOnboardRequest(page);
	await expect(page.getByTestId('pay-to-approve')).toBeVisible();
	await page.getByTestId('pay-approve-button').click();

	// Refused payment: honest no-funds-moved copy, still awaiting approval,
	// and the CTA remains for a retry.
	await expect(page.getByText('Payment not accepted')).toBeVisible();
	await expect(page.getByText(/payment not valid/)).toBeVisible();
	await expect(page.getByText(/No funds moved/)).toBeVisible();
	await expect(page.getByText('Awaiting operator approval')).toBeVisible();

	await page.getByTestId('pay-approve-button').click();
	await expect(page.getByRole('heading', { name: 'Genesis' })).toBeVisible({ timeout: 15_000 });

	// Each attempt signed a FRESH authorization (new nonce) — a refused
	// payment is never replayed.
	expect(onboarding.payments).toHaveLength(2);
	expect(onboarding.payments[0]!.authorization.nonce).not.toBe(
		onboarding.payments[1]!.authorization.nonce
	);
});

test('pay-to-approve: a vetted deployment never shows a pay option', async ({ page }) => {
	await installCoordinatorMocks(page, {});
	const onboarding = await installCanopyOnboardingMocks(page, { vetted: true });
	await installInjectedWalletMock(page, { codeAddresses: [E2E_UNIVOCITY_ADDR] });

	await submitOnboardRequest(page);

	// The probe ran (and was refused 409) — only the ops copy renders.
	await expect.poll(() => onboarding.redeemPosts()).toBeGreaterThan(0);
	await expect(page.getByTestId('pay-to-approve')).toHaveCount(0);
	await expect(page.getByText(/out of band/)).toBeVisible();
	expect(onboarding.payments).toHaveLength(0);
});
