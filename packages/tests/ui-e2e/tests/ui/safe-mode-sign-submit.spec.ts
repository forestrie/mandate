import { expect, test } from '@playwright/test';
import {
	E2E_AUTH_LOG_ID,
	E2E_INJECTED_OWNER_ADDRESS,
	E2E_SAFE_ADDRESS,
	installCoordinatorMocks,
	installInjectedWalletMock,
	loadPending,
	recordedTypedDataRequests,
	samplePendingEntry
} from '@forestrie/mandate-ui-e2e-kit';

// Safe 1x1 (Mode D) is a SESSION choice on the default (privy-configured)
// build — no special env. Hermetic: EIP-6963 wallet, coordinator BFF and the
// Safe's chain reads are all mocked; nothing reaches Privy or a real RPC.
test('Safe mode: connect owner, validate Safe, sign a SafeMessage and submit', async ({ page }) => {
	let submitted = false;
	await installCoordinatorMocks(page, {
		pendingEntries: [samplePendingEntry()],
		onCertificateSubmit: () => {
			submitted = true;
		}
	});
	await installInjectedWalletMock(page);
	await page.goto(`/delegations?authLogId=${encodeURIComponent(E2E_AUTH_LOG_ID)}`);

	await page.getByRole('radio', { name: 'External wallet + Safe' }).click();
	// Mode D never touches Privy — the login card must be gone.
	await expect(page.getByPlaceholder('Email for Privy login')).toHaveCount(0);

	await page.getByRole('button', { name: 'Connect E2E Wallet' }).click();
	await expect(page.getByText(`${E2E_INJECTED_OWNER_ADDRESS.slice(0, 6)}`)).toBeVisible();

	await page.getByLabel('Safe address').fill(E2E_SAFE_ADDRESS);
	await page.getByRole('button', { name: 'Validate' }).click();
	await expect(page.getByText('Safe validated — 1-of-1, owner confirmed')).toBeVisible();

	await loadPending(page);
	await page.getByRole('button', { name: 'Sign & submit' }).click();
	await expect(page.locator('tbody').getByText('Submitted')).toBeVisible({ timeout: 15_000 });
	expect(submitted).toBe(true);

	// The wallet signed the Safe's EIP-712 SafeMessage — owner as from, the
	// Safe as verifyingContract, and a bytes32 digest as the wrapped message.
	const typedDataRequests = await recordedTypedDataRequests(page);
	const safeMessage = typedDataRequests.find((r) => r.primaryType === 'SafeMessage');
	expect(safeMessage).toBeDefined();
	expect(safeMessage!.from.toLowerCase()).toBe(E2E_INJECTED_OWNER_ADDRESS);
	expect((safeMessage!.domain.verifyingContract as string).toLowerCase()).toBe(E2E_SAFE_ADDRESS);
	expect(safeMessage!.message.message).toMatch(/^0x[0-9a-f]{64}$/);
});

test('Safe mode: validation rejects a Safe the connected wallet does not own', async ({ page }) => {
	await installCoordinatorMocks(page, { pendingEntries: [] });
	await installInjectedWalletMock(page, { owners: [`0x${'99'.repeat(20)}`] });
	await page.goto(`/delegations?authLogId=${encodeURIComponent(E2E_AUTH_LOG_ID)}`);

	await page.getByRole('radio', { name: 'External wallet + Safe' }).click();
	await page.getByRole('button', { name: 'Connect E2E Wallet' }).click();
	await page.getByLabel('Safe address').fill(E2E_SAFE_ADDRESS);
	await page.getByRole('button', { name: 'Validate' }).click();

	await expect(page.getByText('Connected wallet is not an owner of this Safe')).toBeVisible();
	// No validated Safe ⇒ signing is refused before any wallet prompt.
	await expect(page.getByText('Safe validated — 1-of-1, owner confirmed')).toHaveCount(0);
});
