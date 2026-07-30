import { expect, test } from '@playwright/test';
import {
	E2E_INJECTED_OWNER_ADDRESS,
	E2E_SAFE_ADDRESS,
	E2E_UNIVOCITY_ADDR,
	installCanopyOnboardingMocks,
	installCoordinatorMocks,
	installInjectedWalletMock,
	recordedPersonalSignRequests,
	recordedTypedDataRequests
} from '@forestrie/mandate-ui-e2e-kit';

// Safe 1x1 (Mode D) onboarding is browser-direct to canopy (no BFF) — the
// wizard's canopy calls, the Safe's chain reads and the coordinator BFF are
// all mocked; nothing reaches a real RPC or a deployed canopy.

async function connectAndValidateSafe(page: import('@playwright/test').Page): Promise<void> {
	await page.getByRole('button', { name: 'Connect E2E Wallet' }).click();
	await page.getByLabel('Safe address').fill(E2E_SAFE_ADDRESS);
	await page.getByRole('button', { name: 'Validate' }).click();
	await expect(page.getByText('Safe validated — 1-of-1, owner confirmed')).toBeVisible();
}

async function fillInstanceDetails(page: import('@playwright/test').Page): Promise<void> {
	await page.getByLabel('Univocity contract address').fill(E2E_UNIVOCITY_ADDR);
	await page.getByLabel('Label', { exact: true }).fill('e2e dev instance');
	await page.getByLabel('Contact email').fill('ops@example.com');
}

test('onboard wizard: attested request → approval → redeem → genesis → wallet route', async ({
	page
}) => {
	const routesSet: Array<{ logId: string; mode: string }> = [];
	await installCoordinatorMocks(page, {
		onSigningRouteSet: (logId, body) => routesSet.push({ logId, mode: body.mode })
	});
	const onboarding = await installCanopyOnboardingMocks(page, { pollsUntilApproved: 1 });
	await installInjectedWalletMock(page, { codeAddresses: [E2E_UNIVOCITY_ADDR] });

	await page.goto('/onboard');
	await connectAndValidateSafe(page);
	await fillInstanceDetails(page);

	await page.getByRole('button', { name: 'Sign attestation & request onboarding' }).click();

	// Honest approval copy: out-of-band, no in-console approve.
	await expect(page.getByText('Awaiting operator approval')).toBeVisible();
	await expect(page.getByText(/out of band/)).toBeVisible();

	// The request carried the Safe-signed attestation (CBOR key 7).
	expect(onboarding.onboardRequests).toHaveLength(1);
	expect(onboarding.onboardRequests[0]!.attestationBytes).toBeGreaterThan(0);
	expect(onboarding.onboardRequests[0]!.univocityAddr).toBe(
		E2E_UNIVOCITY_ADDR.replace(/^0x/, '').toLowerCase()
	);

	// Poll flips to approved (mock approves after one pending poll).
	await page.getByRole('button', { name: 'Redeem' }).click({ timeout: 20_000 });
	await page.getByRole('button', { name: 'Run genesis' }).click();
	await page.getByRole('button', { name: 'Set wallet signing route' }).click();

	await expect(page.getByText('Instance registered')).toBeVisible({ timeout: 15_000 });
	await expect(page.getByText(`eip155:84532:${E2E_UNIVOCITY_ADDR.toLowerCase()}`)).toBeVisible();

	// Genesis: bootstrapKey is the Safe address and NO agent webhook is
	// registered — interactive roots are served by the pending queue.
	expect(onboarding.genesisPosts).toHaveLength(1);
	const genesis = onboarding.genesisPosts[0]!;
	expect(genesis.url).not.toContain('webhookUrl');
	expect(genesis.bootstrapKeyHex).toBe(E2E_SAFE_ADDRESS.replace(/^0x/, ''));
	expect(genesis.authorization).toBe('Bearer e2e-onboard-token');

	// The signing route was set to wallet for the freshly-derived log id.
	expect(routesSet).toHaveLength(1);
	expect(routesSet[0]!.mode).toBe('wallet');
	expect(routesSet[0]!.logId).toMatch(/^[0-9a-f]{32}$/);

	// Hand-off links carry the registered identifiers.
	await expect(page.getByRole('link', { name: 'Buy credits' })).toHaveAttribute(
		'href',
		new RegExp(`/fees\\?instance=`)
	);
	await expect(page.getByRole('link', { name: 'Approve delegations' })).toHaveAttribute(
		'href',
		new RegExp(`/delegations\\?authLogId=${routesSet[0]!.logId}`)
	);

	// Two SafeMessages (attestation + wcc-1 control-plane challenge), zero
	// personal_sign — a contract root never signs EIP-191 directly.
	const typedData = await recordedTypedDataRequests(page);
	const safeMessages = typedData.filter((r) => r.primaryType === 'SafeMessage');
	expect(safeMessages).toHaveLength(2);
	for (const safeMessage of safeMessages) {
		expect(safeMessage.from.toLowerCase()).toBe(E2E_INJECTED_OWNER_ADDRESS);
		expect((safeMessage.domain.verifyingContract as string).toLowerCase()).toBe(E2E_SAFE_ADDRESS);
	}
	await expect(recordedPersonalSignRequests(page)).resolves.toHaveLength(0);
});

test('onboard wizard: D7 reservation conflict names the univocity instance', async ({ page }) => {
	await installCoordinatorMocks(page, {});
	await installCanopyOnboardingMocks(page, {
		pollsUntilApproved: 0,
		genesisConflictDetail: 'univocity instance already registered to forest root R-other'
	});
	await installInjectedWalletMock(page, { codeAddresses: [E2E_UNIVOCITY_ADDR] });

	await page.goto('/onboard');
	await connectAndValidateSafe(page);
	await fillInstanceDetails(page);
	await page.getByRole('button', { name: 'Sign attestation & request onboarding' }).click();

	await page.getByRole('button', { name: 'Redeem' }).click({ timeout: 20_000 });
	await page.getByRole('button', { name: 'Run genesis' }).click();

	await expect(page.getByText('Instance already claimed')).toBeVisible();
	await expect(page.getByText(`eip155:84532:${E2E_UNIVOCITY_ADDR.toLowerCase()}`)).toBeVisible();
	await expect(page.getByText(/already registered to forest root R-other/)).toBeVisible();
});

test('onboard wizard: progress survives a reload while awaiting approval', async ({ page }) => {
	await installCoordinatorMocks(page, {});
	// Never approve: the wizard must stay honest and keep waiting.
	await installCanopyOnboardingMocks(page, { pollsUntilApproved: Number.MAX_SAFE_INTEGER });
	await installInjectedWalletMock(page, { codeAddresses: [E2E_UNIVOCITY_ADDR] });

	await page.goto('/onboard');
	await connectAndValidateSafe(page);
	await fillInstanceDetails(page);
	await page.getByRole('button', { name: 'Sign attestation & request onboarding' }).click();
	await expect(page.getByText('Awaiting operator approval')).toBeVisible();

	await page.reload();

	// Resumed from sessionStorage: same request id, still awaiting, no re-sign.
	await expect(page.getByText('Awaiting operator approval')).toBeVisible();
	await expect(page.getByText('e2e-onboard-request-1')).toBeVisible();
});
