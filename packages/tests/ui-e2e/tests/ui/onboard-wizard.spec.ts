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
	const sessionEnvelopes: Array<{ chainId?: string }> = [];
	await installCoordinatorMocks(page, {
		onSigningRouteSet: (logId, body) => routesSet.push({ logId, mode: body.mode }),
		onSessionExchange: (body) => sessionEnvelopes.push(body.envelope)
	});
	const onboarding = await installCanopyOnboardingMocks(page, { pollsUntilApproved: 1 });
	await installInjectedWalletMock(page, { codeAddresses: [E2E_UNIVOCITY_ADDR] });

	await page.goto('/onboard');
	await connectAndValidateSafe(page);
	await fillInstanceDetails(page);

	// The current step is exposed to assistive tech, not colour-only.
	await expect(page.locator('li[aria-current="step"]')).toHaveText(/Instance details/);

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

	// Safe mode binds the console's chain into the signed wcc-1 envelope —
	// the coordinator 403s a mismatch against the log's chain binding.
	expect(sessionEnvelopes.length).toBeGreaterThan(0);
	for (const envelope of sessionEnvelopes) {
		expect(envelope.chainId).toBe('84532');
	}

	// Wizard completion scrubs the one-time credentials from sessionStorage.
	const residual = await page.evaluate(() => sessionStorage.getItem('mandate.session.onboard'));
	expect(residual).not.toContain('e2e-onboard-token');
	expect(residual).not.toContain('e2e-redeem-code');

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
	const onboarding = await installCanopyOnboardingMocks(page, {
		pollsUntilApproved: Number.MAX_SAFE_INTEGER
	});
	await installInjectedWalletMock(page, { codeAddresses: [E2E_UNIVOCITY_ADDR] });

	await page.goto('/onboard');
	await connectAndValidateSafe(page);
	await fillInstanceDetails(page);
	await page.getByRole('button', { name: 'Sign attestation & request onboarding' }).click();
	await expect(page.getByText('Awaiting operator approval')).toBeVisible();

	await page.reload();

	// Resumed from sessionStorage: same request id, still awaiting, no re-sign
	// — the resumed session must NOT submit (or attest) a second request.
	await expect(page.getByText('Awaiting operator approval')).toBeVisible();
	await expect(page.getByText('e2e-onboard-request-1')).toBeVisible();
	expect(onboarding.onboardRequests).toHaveLength(1);
	await expect(recordedTypedDataRequests(page)).resolves.toHaveLength(0);
});

test('onboard wizard: a lost onboard token re-redeems in place (idempotent re-redeem)', async ({
	page
}) => {
	// A crash between canopy's redeem commit and the wizard's persist() leaves
	// requestStatus=redeemed with no token. Canopy re-issues a fresh token for
	// the valid code (plan-2607-46 slice 02), so Redeem simply works again.
	await installCoordinatorMocks(page, {});
	const onboarding = await installCanopyOnboardingMocks(page, {});
	await installInjectedWalletMock(page, { codeAddresses: [E2E_UNIVOCITY_ADDR] });
	await page.addInitScript(
		([progress]) => sessionStorage.setItem('mandate.session.onboard', progress!),
		[
			JSON.stringify({
				chainId: '84532',
				univocityAddr: E2E_UNIVOCITY_ADDR.replace(/^0x/, '').toLowerCase(),
				label: 'e2e dev instance',
				contactEmail: 'ops@example.com',
				safeAddress: E2E_SAFE_ADDRESS,
				requestId: 'e2e-onboard-request-1',
				redeemCode: 'e2e-redeem-code',
				requestStatus: 'redeemed'
			})
		]
	);

	await page.goto('/onboard');
	await expect(page.getByRole('button', { name: 'Redeem' })).toBeVisible();
	await page.getByRole('button', { name: 'Redeem' }).click();

	await expect(page.getByRole('heading', { name: 'Genesis' })).toBeVisible();
	expect(onboarding.redeemPosts()).toBe(1);
});

test('onboard wizard: transient redeem failure retries in place, 410 expiry is terminal', async ({
	page
}) => {
	await installCoordinatorMocks(page, {});
	const onboarding = await installCanopyOnboardingMocks(page, {
		pollsUntilApproved: 0,
		redeemErrors: [
			{ status: 409, detail: 'Concurrent re-redeem contention; retry the redeem request' }
		]
	});
	await installInjectedWalletMock(page, { codeAddresses: [E2E_UNIVOCITY_ADDR] });

	await page.goto('/onboard');
	await connectAndValidateSafe(page);
	await fillInstanceDetails(page);
	await page.getByRole('button', { name: 'Sign attestation & request onboarding' }).click();

	// First redeem hits the injected 409 — the wizard stays on redeem and
	// says retrying is safe; the second attempt succeeds.
	await page.getByRole('button', { name: 'Redeem' }).click({ timeout: 20_000 });
	await expect(page.getByText(/retry Redeem/)).toBeVisible();
	await page.getByRole('button', { name: 'Redeem' }).click();
	await expect(page.getByRole('heading', { name: 'Genesis' })).toBeVisible();
	// 3 = the pending pay-to-approve probe (FOR-511) + the two user redeems.
	expect(onboarding.redeemPosts()).toBe(3);
});

test('onboard wizard: 410 on redeem marks the request expired (terminal)', async ({ page }) => {
	await installCoordinatorMocks(page, {});
	await installCanopyOnboardingMocks(page, {
		pollsUntilApproved: 0,
		redeemErrors: [
			{ status: 410, detail: 'Request expired; the redeem code no longer re-issues a token' },
			{ status: 410, detail: 'Request expired; the redeem code no longer re-issues a token' }
		]
	});
	await installInjectedWalletMock(page, { codeAddresses: [E2E_UNIVOCITY_ADDR] });

	await page.goto('/onboard');
	await connectAndValidateSafe(page);
	await fillInstanceDetails(page);
	await page.getByRole('button', { name: 'Sign attestation & request onboarding' }).click();

	await page.getByRole('button', { name: 'Redeem' }).click({ timeout: 20_000 });
	await expect(page.getByRole('heading', { name: 'Request expired' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Start over' })).toBeVisible();
});

test('onboard wizard: rejection while polling lands on the terminal failed step and polling stops', async ({
	page
}) => {
	const onboarding = await installCanopyOnboardingMocks(page, {
		pollsUntilApproved: Number.MAX_SAFE_INTEGER,
		rejectAfterPolls: 1
	});
	await installCoordinatorMocks(page, {});
	await installInjectedWalletMock(page, { codeAddresses: [E2E_UNIVOCITY_ADDR] });

	await page.goto('/onboard');
	await connectAndValidateSafe(page);
	await fillInstanceDetails(page);
	await page.getByRole('button', { name: 'Sign attestation & request onboarding' }).click();

	await expect(page.getByRole('heading', { name: 'Request rejected' })).toBeVisible({
		timeout: 20_000
	});
	await expect(page.getByText(/operator rejected/)).toBeVisible();

	// Terminal means terminal: no further status polls are scheduled.
	const pollsAtRejection = onboarding.statusPolls();
	await page.waitForTimeout(6_000);
	expect(onboarding.statusPolls()).toBe(pollsAtRejection);
});

test('onboard wizard: signing-route failure after genesis resumes at signing-route', async ({
	page
}) => {
	const routesSet: Array<{ logId: string; mode: string }> = [];
	await installCoordinatorMocks(page, {
		onSigningRouteSet: (logId, body) => routesSet.push({ logId, mode: body.mode }),
		signingRouteFailures: 1
	});
	const onboarding = await installCanopyOnboardingMocks(page, { pollsUntilApproved: 0 });
	await installInjectedWalletMock(page, { codeAddresses: [E2E_UNIVOCITY_ADDR] });

	await page.goto('/onboard');
	await connectAndValidateSafe(page);
	await fillInstanceDetails(page);
	await page.getByRole('button', { name: 'Sign attestation & request onboarding' }).click();
	await page.getByRole('button', { name: 'Redeem' }).click({ timeout: 20_000 });
	await page.getByRole('button', { name: 'Run genesis' }).click();

	// The injected 503 leaves the wizard on signing-route with the error shown.
	await page.getByRole('button', { name: 'Set wallet signing route' }).click();
	await expect(page.getByText(/signing-route temporarily unavailable/)).toBeVisible();
	expect(routesSet).toHaveLength(0);

	// Genesis already registered the instance — a reload resumes HERE, not at
	// genesis (logIdHex32 is persisted), and the retry completes the wizard.
	await page.reload();
	await connectAndValidateSafe(page);
	await expect(page.getByRole('button', { name: 'Set wallet signing route' })).toBeVisible();
	expect(onboarding.genesisPosts).toHaveLength(1);

	await page.getByRole('button', { name: 'Set wallet signing route' }).click();
	await expect(page.getByText('Instance registered')).toBeVisible({ timeout: 15_000 });
	expect(routesSet).toHaveLength(1);
	expect(routesSet[0]!.mode).toBe('wallet');
	// The repair path did NOT re-run genesis — registration was already good.
	expect(onboarding.genesisPosts).toHaveLength(1);
});

test('onboard wizard: missed public-root registration is repaired by idempotent re-genesis', async ({
	page
}) => {
	const routesSet: Array<{ logId: string; mode: string }> = [];
	await installCoordinatorMocks(page, {
		onSigningRouteSet: (logId, body) => routesSet.push({ logId, mode: body.mode })
	});
	// First genesis post misses the best-effort coordinator registration.
	const onboarding = await installCanopyOnboardingMocks(page, {
		pollsUntilApproved: 0,
		publicRootErrorPosts: 1
	});
	await installInjectedWalletMock(page, { codeAddresses: [E2E_UNIVOCITY_ADDR] });

	await page.goto('/onboard');
	await connectAndValidateSafe(page);
	await fillInstanceDetails(page);
	await page.getByRole('button', { name: 'Sign attestation & request onboarding' }).click();
	await page.getByRole('button', { name: 'Redeem' }).click({ timeout: 20_000 });
	await page.getByRole('button', { name: 'Run genesis' }).click();

	// The wizard is explicit that the route step will retry genesis first.
	await expect(page.getByText('Coordinator registration pending')).toBeVisible();

	await page.getByRole('button', { name: 'Set wallet signing route' }).click();
	await expect(page.getByText('Instance registered')).toBeVisible({ timeout: 15_000 });

	// The repair re-ran genesis with the SAME forest R (idempotent) and the
	// same pinned Safe bootstrap key, then set the route.
	expect(onboarding.genesisPosts).toHaveLength(2);
	const [first, second] = onboarding.genesisPosts;
	expect(new URL(second!.url).pathname).toBe(new URL(first!.url).pathname);
	expect(second!.bootstrapKeyHex).toBe(first!.bootstrapKeyHex);
	expect(routesSet).toHaveLength(1);
});
