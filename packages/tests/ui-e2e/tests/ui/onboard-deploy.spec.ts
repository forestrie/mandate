import { expect, test } from '@playwright/test';
import {
	E2E_SAFE_ADDRESS,
	e2eDeployPlan,
	installCanopyOnboardingMocks,
	installCoordinatorMocks,
	installDeployManifestMocks,
	installInjectedWalletMock,
	installSafeTxServiceMocks,
	recordedSendTransactionRequests,
	recordedTypedDataRequests
} from '@forestrie/mandate-ui-e2e-kit';

// Inline Safe deploy branch of the /onboard details step (plan-2607-47 slice
// 02): manifest bytes ride the mandate BFF proxy but are VERIFIED in-page
// (the mock serves a real sha256-consistent manifest), the SafeTx is signed
// on the SafeTx EIP-712 domain by the owner wallet, and the proposal goes
// browser-direct to the Safe Transaction Service gateway — all mocked, so
// nothing leaves the box.

async function connectAndValidateSafe(page: import('@playwright/test').Page): Promise<void> {
	await page.getByRole('button', { name: 'Connect E2E Wallet' }).click();
	await page.getByLabel('Safe address').fill(E2E_SAFE_ADDRESS);
	await page.getByRole('button', { name: 'Validate' }).click();
	await expect(page.getByText('Safe validated — 1-of-1, owner confirmed')).toBeVisible();
}

async function openDeployBranch(page: import('@playwright/test').Page): Promise<void> {
	await page.goto('/onboard');
	await connectAndValidateSafe(page);
	await page.getByRole('button', { name: 'Deploy one now' }).click();
}

test('deploy branch: verify → predict → propose reaches "proposed" with the SafeTx domain', async ({
	page
}) => {
	await installCoordinatorMocks(page, {});
	await installDeployManifestMocks(page);
	const sts = await installSafeTxServiceMocks(page);
	await installInjectedWalletMock(page);

	await openDeployBranch(page);

	// The default tag is the concrete build-time-resolved version, not a
	// `latest` sentinel the page would have to resolve via GitHub.
	await expect(page.getByLabel('Release tag')).toHaveValue('v0.1.8');

	await page.getByRole('button', { name: 'Verify release & predict address' }).click();

	// The prediction matches the deterministic plan for this Safe (Q6).
	const plan = e2eDeployPlan(E2E_SAFE_ADDRESS);
	await expect(page.getByTestId('deploy-predicted-address')).toHaveText(plan.predictedAddress);

	await page.getByRole('button', { name: 'Propose to Safe', exact: true }).click();
	await expect(page.getByText('Deployment proposed')).toBeVisible();

	// The owner signed the SafeTx domain (verifyingContract = the Safe), NOT
	// a SafeMessage — the backends' wire-bytes seam is untouched.
	const typedData = await recordedTypedDataRequests(page);
	expect(typedData).toHaveLength(1);
	expect(typedData[0]!.primaryType).toBe('SafeTx');
	expect((typedData[0]!.domain.verifyingContract as string).toLowerCase()).toBe(E2E_SAFE_ADDRESS);

	// The gateway proposal carries the displayed SafeTx hash and the plan salt.
	expect(sts.proposals).toHaveLength(1);
	const proposal = sts.proposals[0]!;
	expect(proposal.safe.toLowerCase()).toBe(E2E_SAFE_ADDRESS);
	expect(proposal.operation).toBe(0);
	expect(proposal.nonce).toBe('0');
	expect(proposal.data).toContain(plan.salt.slice(2));
	await expect(page.getByText(proposal.contractTransactionHash)).toBeVisible();
});

test('deploy branch: reload resumes the deploy sub-step with the same predicted address', async ({
	page
}) => {
	await installCoordinatorMocks(page, {});
	await installDeployManifestMocks(page);
	await installSafeTxServiceMocks(page);
	await installInjectedWalletMock(page);

	await openDeployBranch(page);
	await page.getByRole('button', { name: 'Verify release & predict address' }).click();
	const predicted = await page.getByTestId('deploy-predicted-address').textContent();

	await page.reload();

	// Resumed from sessionStorage: the deploy sub-step is active with the
	// identical prediction — no re-verify, no re-plan needed to display it.
	await expect(page.getByTestId('deploy-predicted-address')).toHaveText(predicted!.trim());
	await expect(page.getByLabel('Release tag')).toHaveValue('v0.1.8');
});

test('deploy branch: code at the predicted address is the already-deployed fast-path', async ({
	page
}) => {
	await installCoordinatorMocks(page, {});
	await installDeployManifestMocks(page);
	await installSafeTxServiceMocks(page);
	const plan = e2eDeployPlan(E2E_SAFE_ADDRESS);
	await installInjectedWalletMock(page, { codeAddresses: [plan.predictedAddress] });

	await openDeployBranch(page);
	await page.getByRole('button', { name: 'Verify release & predict address' }).click();

	// Deterministic salt: an earlier session's deployment is simply found.
	await expect(page.getByText('this instance is already deployed', { exact: false })).toBeVisible();
	await page.getByRole('button', { name: 'Use this instance' }).click();

	// Back on the paste form with the deployed instance adopted.
	await expect(page.getByLabel('Univocity contract address')).toHaveValue(plan.predictedAddress);
	await expect(recordedTypedDataRequests(page)).resolves.toHaveLength(0);
});

test('deploy branch: STS failure is non-fatal — warn, keep the signature local, retry works', async ({
	page
}) => {
	await installCoordinatorMocks(page, {});
	await installDeployManifestMocks(page);
	const sts = await installSafeTxServiceMocks(page, { proposalFailures: 1 });
	await installInjectedWalletMock(page);

	await openDeployBranch(page);
	await page.getByRole('button', { name: 'Verify release & predict address' }).click();
	await page.getByRole('button', { name: 'Propose to Safe', exact: true }).click();

	// The propose leg is best-effort (Q5): the failure is a warning, not a
	// dead-end, and the SafeTx hash is still recorded.
	await expect(page.getByText('Proposal not recorded')).toBeVisible();
	await expect(page.getByText(/signature stays local/)).toBeVisible();

	await page.getByRole('button', { name: 'Propose to Safe', exact: true }).click();
	await expect(page.getByText('Deployment proposed')).toBeVisible();
	expect(sts.proposalPosts()).toBe(2);
	expect(sts.proposals).toHaveLength(1);
});

test('deploy branch: inline execute deploys, the poll adopts the instance, and the full onboard completes', async ({
	page
}) => {
	const routesSet: Array<{ logId: string; mode: string }> = [];
	await installCoordinatorMocks(page, {
		onSigningRouteSet: (logId, body) => routesSet.push({ logId, mode: body.mode })
	});
	const onboarding = await installCanopyOnboardingMocks(page, { pollsUntilApproved: 0 });
	await installDeployManifestMocks(page);
	await installSafeTxServiceMocks(page);
	const wallet = await installInjectedWalletMock(page);
	const plan = e2eDeployPlan(E2E_SAFE_ADDRESS);

	await openDeployBranch(page);
	await page.getByRole('button', { name: 'Verify release & predict address' }).click();
	await page.getByRole('button', { name: 'Propose to Safe', exact: true }).click();
	await expect(page.getByText('Deployment proposed')).toBeVisible();

	// The inline leg: execTransaction from the connected owner — the console's
	// first eth_sendTransaction, and it has a `to` (the Safe).
	await page.getByRole('button', { name: 'Execute with owner wallet' }).click();
	await expect.poll(async () => (await recordedSendTransactionRequests(page)).length).toBe(1);
	const [sent] = await recordedSendTransactionRequests(page);
	expect(sent!.to.toLowerCase()).toBe(E2E_SAFE_ADDRESS);
	// The deployment lands (as the mined receipt implies on a real chain).
	await wallet.markDeployed(plan.predictedAddress);

	// Auto-advance: the poll finds the code, adopts the instance, and returns
	// to the attestation form with the address filled — no manual check.
	await expect(page.getByLabel('Univocity contract address')).toHaveValue(plan.predictedAddress, {
		timeout: 15_000
	});
	await expect(page.getByText('Instance deployed')).toBeVisible();

	// From here the shipped flow is unchanged: attest → request → approval →
	// redeem → genesis → signing route.
	await page.getByLabel('Label', { exact: true }).fill('e2e inline deploy');
	await page.getByLabel('Contact email').fill('ops@example.com');
	await page.getByRole('button', { name: 'Sign attestation & request onboarding' }).click();
	await page.getByRole('button', { name: 'Redeem' }).click({ timeout: 20_000 });
	await page.getByRole('button', { name: 'Run genesis' }).click();
	await page.getByRole('button', { name: 'Set wallet signing route' }).click();
	await expect(page.getByText('Instance registered')).toBeVisible({ timeout: 15_000 });

	// The onboarded instance IS the CREATE2 prediction, attested and genesis'd
	// with the Safe as bootstrap key, and the wallet route was set.
	expect(onboarding.onboardRequests[0]!.univocityAddr).toBe(
		plan.predictedAddress.replace(/^0x/, '').toLowerCase()
	);
	expect(onboarding.genesisPosts).toHaveLength(1);
	expect(onboarding.genesisPosts[0]!.bootstrapKeyHex).toBe(E2E_SAFE_ADDRESS.replace(/^0x/, ''));
	expect(routesSet).toHaveLength(1);
	expect(routesSet[0]!.mode).toBe('wallet');
});

test('deploy branch: inline execute succeeds with the STS down — execution never depends on the service', async ({
	page
}) => {
	await installCoordinatorMocks(page, {});
	await installDeployManifestMocks(page);
	const sts = await installSafeTxServiceMocks(page, { proposalFailures: 99 });
	const wallet = await installInjectedWalletMock(page);
	const plan = e2eDeployPlan(E2E_SAFE_ADDRESS);

	await openDeployBranch(page);
	await page.getByRole('button', { name: 'Verify release & predict address' }).click();
	await page.getByRole('button', { name: 'Propose to Safe', exact: true }).click();

	// The proposal never reached the service, but the signature stayed local…
	await expect(page.getByText('Proposal not recorded')).toBeVisible();
	expect(sts.proposals).toHaveLength(0);

	// …so the inline leg executes regardless.
	await page.getByRole('button', { name: 'Execute with owner wallet' }).click();
	await expect.poll(async () => (await recordedSendTransactionRequests(page)).length).toBe(1);
	await wallet.markDeployed(plan.predictedAddress);
	await expect(page.getByLabel('Univocity contract address')).toHaveValue(plan.predictedAddress, {
		timeout: 15_000
	});
});

test('deploy branch: jump-leg resume — executed elsewhere, the poll advances without a send', async ({
	page
}) => {
	await installCoordinatorMocks(page, {});
	await installDeployManifestMocks(page);
	await installSafeTxServiceMocks(page);
	const wallet = await installInjectedWalletMock(page);
	const plan = e2eDeployPlan(E2E_SAFE_ADDRESS);

	await openDeployBranch(page);
	await page.getByRole('button', { name: 'Verify release & predict address' }).click();
	await page.getByRole('button', { name: 'Propose to Safe', exact: true }).click();
	await expect(page.getByText('Deployment proposed')).toBeVisible();

	// Come back later: the proposal was executed from the Safe app meanwhile.
	await page.reload();
	await connectAndValidateSafe(page);
	await expect(page.getByTestId('deploy-watching')).toBeVisible();
	await wallet.markDeployed(plan.predictedAddress);

	// The resumed poll finds the code and advances — no in-console execution.
	await expect(page.getByLabel('Univocity contract address')).toHaveValue(plan.predictedAddress, {
		timeout: 15_000
	});
	await expect(recordedSendTransactionRequests(page)).resolves.toHaveLength(0);
});

test('deploy branch: an execution the Safe would revert is surfaced honestly', async ({ page }) => {
	await installCoordinatorMocks(page, {});
	await installDeployManifestMocks(page);
	await installSafeTxServiceMocks(page);
	await installInjectedWalletMock(page, { executeRevert: 'estimate' });

	await openDeployBranch(page);
	await page.getByRole('button', { name: 'Verify release & predict address' }).click();
	await page.getByRole('button', { name: 'Propose to Safe', exact: true }).click();
	await page.getByRole('button', { name: 'Execute with owner wallet' }).click();

	// Honest failure, no retry loop, nothing sent, nothing adopted.
	await expect(page.getByText(/would revert this execution/)).toBeVisible();
	await expect(recordedSendTransactionRequests(page)).resolves.toHaveLength(0);
	await expect(page.getByTestId('deploy-predicted-address')).toBeVisible();
});
