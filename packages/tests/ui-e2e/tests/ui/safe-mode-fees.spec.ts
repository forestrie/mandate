import { expect, test } from '@playwright/test';
import {
	E2E_INJECTED_OWNER_ADDRESS,
	E2E_SAFE_ADDRESS,
	E2E_UNIVOCITY_INSTANCE_ID,
	installCanopyPaymentsMocks,
	installInjectedWalletMock,
	recordedTypedDataRequests
} from '@forestrie/mandate-ui-e2e-kit';

// The fee surface on a Safe root (plan-2607-45 slice 03 §D): the attested
// read is signed through the SafeBackend (SafeMessage), while the x402
// purchase is paid by the injected OWNER EOA — decoupled from the signing
// backend (decision Q9).
test('Safe mode fees: attested read via SafeMessage, purchase paid by the owner EOA', async ({
	page
}) => {
	const state = await installCanopyPaymentsMocks(page, { initialBalance: 42 });
	await installInjectedWalletMock(page);
	await page.goto(`/fees?instance=${encodeURIComponent(E2E_UNIVOCITY_INSTANCE_ID)}`);

	await page.getByRole('radio', { name: 'External wallet + Safe' }).click();
	await expect(page.getByPlaceholder('operator@example.com')).toHaveCount(0);

	await page.getByRole('button', { name: 'Connect E2E Wallet' }).click();
	await page.getByLabel('Safe address').fill(E2E_SAFE_ADDRESS);
	await page.getByRole('button', { name: 'Validate' }).click();
	await expect(page.getByText('Safe validated — 1-of-1, owner confirmed')).toBeVisible();

	await page.getByRole('button', { name: 'Load' }).click();
	await expect(page.getByText('Sealing active')).toBeVisible();

	await page.getByRole('button', { name: 'Get quote' }).click();
	await expect(page.getByText('$1.00')).toBeVisible();
	await page.getByRole('button', { name: 'Sign & pay' }).click();
	await expect(page.getByText(/Payment accepted/)).toBeVisible();
	expect(state.purchases).toEqual([{ credits: 100, amountAtomic: '1000000' }]);

	const typedDataRequests = await recordedTypedDataRequests(page);
	// The read credential was a SafeMessage against the Safe root…
	const safeMessage = typedDataRequests.find((r) => r.primaryType === 'SafeMessage');
	expect(safeMessage).toBeDefined();
	expect((safeMessage!.domain.verifyingContract as string).toLowerCase()).toBe(E2E_SAFE_ADDRESS);
	// …and the payment authorization came FROM the owner EOA, not the Safe.
	const transfer = typedDataRequests.find((r) => r.primaryType === 'TransferWithAuthorization');
	expect(transfer).toBeDefined();
	expect((transfer!.message.from as string).toLowerCase()).toBe(E2E_INJECTED_OWNER_ADDRESS);
	expect(transfer!.from.toLowerCase()).toBe(E2E_INJECTED_OWNER_ADDRESS);
});
