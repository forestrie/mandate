import { expect, test } from '@playwright/test';
import {
	E2E_SAFE_ADDRESS,
	e2eDeployPlan,
	installCoordinatorMocks,
	installDeployManifestMocks,
	installInjectedWalletMock,
	installSafeTxServiceMocks,
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
