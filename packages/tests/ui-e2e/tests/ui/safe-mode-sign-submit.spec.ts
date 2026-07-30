import { expect, test } from '@playwright/test';
import {
	E2E_AUTH_LOG_ID,
	E2E_INJECTED_OWNER_ADDRESS,
	E2E_SAFE_ADDRESS,
	installCoordinatorMocks,
	installInjectedWalletMock,
	loadPending,
	recordedPersonalSignRequests,
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

	// The wallet signed EIP-712 SafeMessages — owner as from, the Safe as
	// verifyingContract, a bytes32 digest as the wrapped message — for BOTH
	// the wcc-1 control-plane challenge (plan-2607-04 R1 / FOR-505: never
	// personal_sign on a contract root) and the certificate Sig_structure.
	const typedDataRequests = await recordedTypedDataRequests(page);
	const safeMessages = typedDataRequests.filter((r) => r.primaryType === 'SafeMessage');
	expect(safeMessages.length).toBeGreaterThanOrEqual(2);
	for (const safeMessage of safeMessages) {
		expect(safeMessage.from.toLowerCase()).toBe(E2E_INJECTED_OWNER_ADDRESS);
		expect((safeMessage.domain.verifyingContract as string).toLowerCase()).toBe(E2E_SAFE_ADDRESS);
		expect(safeMessage.message.message).toMatch(/^0x[0-9a-f]{64}$/);
	}
	// No personal_sign challenge reached the mock wallet in safe mode — the
	// coordinator would 403 it against a contract root.
	await expect(recordedPersonalSignRequests(page)).resolves.toHaveLength(0);
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

test('Safe mode: a pre-1.3.0 Safe is rejected with an explicit version reason', async ({
	page
}) => {
	await installCoordinatorMocks(page, { pendingEntries: [] });
	await installInjectedWalletMock(page, { safeVersion: '1.1.1' });
	await page.goto(`/delegations?authLogId=${encodeURIComponent(E2E_AUTH_LOG_ID)}`);

	await page.getByRole('radio', { name: 'External wallet + Safe' }).click();
	await page.getByRole('button', { name: 'Connect E2E Wallet' }).click();
	await page.getByLabel('Safe address').fill(E2E_SAFE_ADDRESS);
	await page.getByRole('button', { name: 'Validate' }).click();

	await expect(page.getByText(/Safe version 1\.1\.1 is not supported/)).toBeVisible();
});

test('Safe mode: unreachable chain reads report unavailable, never a verdict', async ({ page }) => {
	await installCoordinatorMocks(page, { pendingEntries: [] });
	await installInjectedWalletMock(page, { chainReadsFail: true });
	await page.goto(`/delegations?authLogId=${encodeURIComponent(E2E_AUTH_LOG_ID)}`);

	await page.getByRole('radio', { name: 'External wallet + Safe' }).click();
	await page.getByRole('button', { name: 'Connect E2E Wallet' }).click();
	await page.getByLabel('Safe address').fill(E2E_SAFE_ADDRESS);
	await page.getByRole('button', { name: 'Validate' }).click();

	await expect(page.getByText('Could not reach the chain')).toBeVisible();
	await expect(page.getByText('Safe not usable')).toHaveCount(0);
});
