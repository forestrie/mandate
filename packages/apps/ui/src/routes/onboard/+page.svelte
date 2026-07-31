<script lang="ts">
	import Alert from '$lib/components/ui/alert.svelte';
	import Badge from '$lib/components/ui/badge.svelte';
	import Button from '$lib/components/ui/button.svelte';
	import Card from '$lib/components/ui/card.svelte';
	import Input from '$lib/components/ui/input.svelte';
	import SafeWalletCard from '$lib/components/safe-wallet-card.svelte';
	import { canopyApiBase, canopyOrigin } from '$lib/payments/canopy-client.js';
	import { setLogSigningRoute } from '$lib/coordinator/client.js';
	import { getConfiguredDefaultChainId } from '$lib/chains/wallet-chain.js';
	import { resolveSigningBackend, setSessionSignerBackend } from '$lib/signing/resolve-backend.js';
	import { getInjectedProvider, getInjectedWalletState } from '$lib/wallets/stores.svelte.js';
	import { defaultSafeReadTransport } from '$lib/wallets/safe-validation.js';
	import {
		defaultUnivocityReleaseTag,
		UNIVOCITY_RELEASES_PAGE_URL
	} from '$lib/deploy/deploy-config.js';
	import { fetchVerifiedRelease, type VerifiedRelease } from '$lib/deploy/manifest-client.js';
	import { buildDeployPlan, proposeSafeDeployment } from '$lib/deploy/deploy-plan.js';
	import { safeDashboardUrl } from '@forestrie/deploy-core';
	import type { Address, Hex } from 'viem';
	import { buildOnboardAttestationKs256 } from '@mandate/register/onboard-attestation';
	import {
		getOnboardRequestStatus,
		redeemOnboardToken,
		requestOnboardToken
	} from '@mandate/register/onboard-client';
	import { provisionModeDGenesis } from '@mandate/register/provision-mode-d';
	import { ReservationConflictError } from '@mandate/register/reservation-conflict-error';
	import { GenesisClientError } from '@mandate/register/genesis-client-error';
	import { OnboardRedeemError } from '@mandate/register/onboard-client';
	import { resolve } from '$app/paths';
	import { onDestroy, onMount } from 'svelte';
	import {
		applyDeployPlan,
		applyGenesisResult,
		applyProposalResult,
		approvalCopy,
		classifyRedeemFailure,
		clearProgress,
		deployPlanSafeGuard,
		deriveStep,
		emptyProgress,
		ensureForestR,
		loadProgress,
		normalizeUnivocityAddrInput,
		parseInstanceIndex,
		pinnedSafeGuard,
		repairFailureCopy,
		saveProgress,
		scrubProgressSecrets,
		useDeployedInstance,
		validateDetails,
		type OnboardProgress,
		type OnboardRequestStatus
	} from './onboard-state.js';

	const APPROVAL_POLL_INTERVAL_MS = 5000;

	let progress = $state<OnboardProgress>(emptyProgress());
	let busy = $state(false);
	let error = $state<string | null>(null);
	let conflict = $state<ReservationConflictError | null>(null);
	let pollTimer = $state<ReturnType<typeof setTimeout> | null>(null);

	// Inline-deploy branch of the details step (plan-2607-47 slice 02).
	let detailsMode = $state<'paste' | 'deploy'>('paste');
	let deployTag = $state('');
	let deployIndex = $state('0');
	/** Digest-verified release held in memory; re-fetched on resume as needed. */
	let verifiedRelease = $state<VerifiedRelease | null>(null);
	let alreadyDeployed = $state(false);
	let deployNotice = $state<string | null>(null);
	let stsWarning = $state<string | null>(null);

	const wallet = $derived(getInjectedWalletState());
	const safeReady = $derived(wallet.safeValidation?.status === 'valid');
	const step = $derived(deriveStep(progress));

	onMount(() => {
		// The wizard IS Mode D: every signature on this page is a SafeMessage
		// from the Safe owner, and /delegations + /fees follow the selection
		// after hand-off.
		setSessionSignerBackend('safe');
		progress = loadProgress();
		if (!progress.chainId) progress.chainId = String(getConfiguredDefaultChainId());
		if (progress.deploy) {
			deployTag = progress.deploy.releaseTag;
			deployIndex = String(progress.deploy.instanceIndex);
			// Resume lands back on the deploy sub-step until the deployed
			// instance has been adopted as the wizard's address input.
			if (!progress.univocityAddr) detailsMode = 'deploy';
		} else {
			deployTag = defaultUnivocityReleaseTag() ?? '';
		}
		if (progress.requestId && !isTerminal(progress.requestStatus)) schedulePoll();
	});

	// Set in onDestroy so a poll mid-await at navigation cannot re-arm the
	// timer and keep writing sessionStorage after unmount.
	let destroyed = false;
	onDestroy(() => {
		destroyed = true;
		stopPolling();
	});

	function isTerminal(status: OnboardRequestStatus | undefined): boolean {
		return (
			status === 'approved' ||
			status === 'redeemed' ||
			status === 'rejected' ||
			status === 'expired'
		);
	}

	function persist() {
		saveProgress(progress);
	}

	function stopPolling() {
		if (pollTimer) clearTimeout(pollTimer);
		pollTimer = null;
	}

	function schedulePoll() {
		stopPolling();
		pollTimer = setTimeout(() => void pollStatus(), APPROVAL_POLL_INTERVAL_MS);
	}

	async function pollStatus() {
		if (!progress.requestId || destroyed) return;
		try {
			const status = await getOnboardRequestStatus(canopyApiBase(), progress.requestId);
			if (destroyed) return;
			progress.requestStatus = status.status as OnboardRequestStatus;
			persist();
		} catch {
			// Polling failures are transient by construction — keep trying.
		}
		if (!destroyed && !isTerminal(progress.requestStatus)) schedulePoll();
	}

	async function submitRequest() {
		error = null;
		const detailsError = validateDetails(progress);
		if (detailsError) {
			error = detailsError;
			return;
		}
		if (!safeReady) {
			error = 'Connect the owner wallet and validate the Safe first.';
			return;
		}
		busy = true;
		try {
			const univocityAddr = normalizeUnivocityAddrInput(progress.univocityAddr)!;

			// The univocity contract must already be deployed — its deployment is
			// external to the console (univocity-tools). eth_getCode is the same
			// read seam the Safe validation uses.
			const provider = getInjectedProvider();
			if (!provider) throw new Error('Wallet provider unavailable — reconnect and retry.');
			// The probe runs over the connected wallet's RPC, which is not
			// necessarily the typed chain — canopy re-verifies server-side on the
			// typed chain either way, so this is a fast-fail courtesy check.
			const code = await defaultSafeReadTransport(provider).getCode(`0x${univocityAddr}`);
			if (!code || code === '0x') {
				throw new Error(
					`No contract code at 0x${univocityAddr} (checked via the connected wallet's RPC). Deploy the univocity instance first (univocity-tools), then retry.`
				);
			}

			const backend = await resolveSigningBackend();
			const attestation = await buildOnboardAttestationKs256(
				{
					chainId: progress.chainId.trim(),
					univocityAddr,
					aud: canopyOrigin(),
					nowSec: Math.floor(Date.now() / 1000)
				},
				(sigStructure) => backend.signKs256SigStructure(sigStructure)
			);

			const result = await requestOnboardToken({
				canopyBaseUrl: canopyApiBase(),
				label: progress.label.trim(),
				chainId: progress.chainId.trim(),
				univocityAddr,
				contactEmail: progress.contactEmail.trim(),
				mandateOrigin: window.location.origin,
				attestation
			});
			progress.univocityAddr = univocityAddr;
			// Pin the Safe that signed the attestation: genesis and every later
			// signing step must use it even if the wallet reconnects to another.
			progress.safeAddress = wallet.safeAddress;
			progress.requestId = result.requestId;
			progress.redeemCode = result.redeemCode;
			progress.requestStatus = result.status as OnboardRequestStatus;
			persist();
			if (!isTerminal(progress.requestStatus)) schedulePoll();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Onboard request failed';
		} finally {
			busy = false;
		}
	}

	async function ensureVerifiedRelease(releaseTag: string): Promise<VerifiedRelease> {
		if (verifiedRelease?.releaseTag === releaseTag) return verifiedRelease;
		const release = await fetchVerifiedRelease(releaseTag);
		verifiedRelease = release;
		return release;
	}

	async function predictedAddressHasCode(predictedAddress: string): Promise<boolean> {
		const provider = getInjectedProvider();
		if (!provider) throw new Error('Wallet provider unavailable — reconnect and retry.');
		const code = await defaultSafeReadTransport(provider).getCode(predictedAddress);
		return Boolean(code) && code !== '0x';
	}

	/** Verify the release in-page, build the deterministic plan, persist it. */
	async function prepareDeploy() {
		error = null;
		deployNotice = null;
		stsWarning = null;
		if (!safeReady) {
			error = 'Connect the owner wallet and validate the Safe first.';
			return;
		}
		const releaseTag = deployTag.trim();
		if (!releaseTag) {
			error = 'Enter a univocity release tag — pick one from the releases page.';
			return;
		}
		const instanceIndex = parseInstanceIndex(deployIndex);
		if (instanceIndex === null) {
			error = 'Instance index must be a small non-negative integer (0 for the first instance).';
			return;
		}
		busy = true;
		try {
			const release = await ensureVerifiedRelease(releaseTag);
			const plan = buildDeployPlan({
				safeAddress: wallet.safeAddress!,
				releaseTag,
				instanceIndex,
				bytecode: release.bytecode
			});
			applyDeployPlan(progress, plan);
			persist();
			// Deterministic salt makes code-at-the-predicted-address the resume
			// fast-path (Q6): an earlier session's deploy is simply found again.
			alreadyDeployed = await predictedAddressHasCode(plan.predictedAddress);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Release verification failed';
		} finally {
			busy = false;
		}
	}

	/** Sign the SafeTx with the owner wallet and propose it (best-effort STS). */
	async function proposeDeploy() {
		if (!progress.deploy) return;
		error = null;
		deployNotice = null;
		stsWarning = null;
		if (!safeReady) {
			error = 'Connect the owner wallet and validate the Safe first.';
			return;
		}
		const guard = deployPlanSafeGuard(progress, wallet.safeAddress);
		if (guard) {
			error = guard;
			return;
		}
		busy = true;
		try {
			const release = await ensureVerifiedRelease(progress.deploy.releaseTag);
			// Rebuild rather than trust the persisted fields: the plan is
			// deterministic, and a manifest that no longer reproduces the
			// persisted prediction must invalidate any recorded proposal.
			const plan = buildDeployPlan({
				safeAddress: progress.deploy.safeAddress,
				releaseTag: progress.deploy.releaseTag,
				instanceIndex: progress.deploy.instanceIndex,
				bytecode: release.bytecode
			});
			applyDeployPlan(progress, plan);
			const provider = getInjectedProvider();
			if (!provider) throw new Error('Wallet provider unavailable — reconnect and retry.');
			const result = await proposeSafeDeployment({
				provider,
				transport: defaultSafeReadTransport(provider),
				ownerAddress: wallet.address!,
				chainId: getConfiguredDefaultChainId(),
				plan
			});
			applyProposalResult(progress, { safeTxHash: result.safeTxHash, proposed: result.proposed });
			persist();
			if (!result.proposed) {
				stsWarning = `The Safe Transaction Service did not record the proposal: ${result.stsDetail}. Your signature stays local — retry proposing, or execute from the next step once it lands (execution never depends on the service).`;
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Proposing the deployment failed';
		} finally {
			busy = false;
		}
	}

	/** Manual poll: has the proposed deployment landed at the predicted address? */
	async function checkDeployed() {
		if (!progress.deploy) return;
		error = null;
		deployNotice = null;
		busy = true;
		try {
			alreadyDeployed = await predictedAddressHasCode(progress.deploy.predictedAddress);
			if (!alreadyDeployed) {
				deployNotice =
					'No contract code at the predicted address yet — execute the proposed transaction with your Safe, then check again.';
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Deployment check failed';
		} finally {
			busy = false;
		}
	}

	/** Adopt the deployed instance and return to the details form. */
	function adoptDeployedInstance() {
		useDeployedInstance(progress);
		persist();
		detailsMode = 'paste';
	}

	async function redeem() {
		if (!progress.requestId || !progress.redeemCode) return;
		error = null;
		busy = true;
		try {
			// Retrying is safe even after a crash between the server's redeem
			// commit and our persist(): canopy re-issues a fresh token for a
			// redeemed request presenting the valid code (plan-2607-46 slice 02).
			progress.onboardToken = await redeemOnboardToken({
				canopyBaseUrl: canopyApiBase(),
				requestId: progress.requestId,
				redeemCode: progress.redeemCode
			});
			persist();
		} catch (err) {
			if (err instanceof OnboardRedeemError) {
				const failure = classifyRedeemFailure(err.status, err.detail);
				error = failure.message;
				if (failure.terminal) {
					progress.requestStatus = 'expired';
					persist();
				}
			} else {
				error = err instanceof Error ? err.message : 'Redeem failed';
			}
		} finally {
			busy = false;
		}
	}

	async function runGenesis() {
		if (!progress.onboardToken) return;
		error = null;
		conflict = null;
		if (!safeReady) {
			error = 'Connect the owner wallet and validate the Safe first.';
			return;
		}
		const guard = pinnedSafeGuard(progress, wallet.safeAddress);
		if (guard) {
			error = guard;
			return;
		}
		busy = true;
		try {
			// Persist R before posting: a retry MUST re-use it (same-root genesis
			// is idempotent; a fresh R would claim a second log id).
			if (ensureForestR(progress)) persist();
			const result = await provisionModeDGenesis({
				onboardToken: progress.onboardToken,
				canopyBaseUrl: canopyApiBase(),
				univocityAddr: progress.univocityAddr,
				chainId: progress.chainId.trim(),
				// The PINNED Safe, not the live wallet: the attestation named it.
				safeAddress: progress.safeAddress ?? wallet.safeAddress,
				forestR: progress.forestR!
			});
			applyGenesisResult(progress, result);
			persist();
		} catch (err) {
			if (err instanceof ReservationConflictError) {
				conflict = err;
			} else {
				error = err instanceof Error ? err.message : 'Genesis failed';
			}
		} finally {
			busy = false;
		}
	}

	async function setWalletRoute() {
		if (!progress.logIdHex32) return;
		error = null;
		if (!safeReady) {
			error = 'Connect the owner wallet and validate the Safe first.';
			return;
		}
		const guard = pinnedSafeGuard(progress, wallet.safeAddress);
		if (guard) {
			error = guard;
			return;
		}
		busy = true;
		try {
			// Re-running genesis is safe (idempotent for the same root) and is
			// the repair path when the best-effort public-root registration at
			// genesis did not land — the wallet-challenge session below needs it.
			if (progress.publicRootRegistered === false) {
				await runGenesisRetryForPublicRoot();
			}
			await setLogSigningRoute(progress.logIdHex32, 'wallet');
			progress.signingRouteSet = true;
			// The wizard is complete — the redeem code and onboard token have no
			// further use; do not leave credentials in sessionStorage.
			scrubProgressSecrets(progress);
			persist();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Setting the signing route failed';
		} finally {
			busy = false;
		}
	}

	async function runGenesisRetryForPublicRoot() {
		if (!progress.onboardToken || !progress.forestR) return;
		let result;
		try {
			result = await provisionModeDGenesis({
				onboardToken: progress.onboardToken,
				canopyBaseUrl: canopyApiBase(),
				univocityAddr: progress.univocityAddr,
				chainId: progress.chainId.trim(),
				safeAddress: progress.safeAddress ?? wallet.safeAddress,
				forestR: progress.forestR
			});
		} catch (err) {
			// Token expiry is not "retry shortly": the instance is registered and
			// ops can finish the coordinator registration out-of-band (R4).
			if (err instanceof GenesisClientError && err.status === 401) {
				throw new Error(repairFailureCopy(401), { cause: err });
			}
			throw err;
		}
		progress.publicRootRegistered = result.genesis.coordinator?.publicRoot === 'ok';
		persist();
		if (progress.publicRootRegistered === false) {
			throw new Error(repairFailureCopy(undefined));
		}
	}

	function startOver() {
		stopPolling();
		clearProgress();
		progress = emptyProgress();
		progress.chainId = String(getConfiguredDefaultChainId());
		error = null;
		conflict = null;
		detailsMode = 'paste';
		deployTag = defaultUnivocityReleaseTag() ?? '';
		deployIndex = '0';
		verifiedRelease = null;
		alreadyDeployed = false;
		deployNotice = null;
		stsWarning = null;
	}

	const steps: Array<{ key: string; title: string }> = [
		{ key: 'details', title: 'Instance details' },
		{ key: 'awaiting-approval', title: 'Approval' },
		{ key: 'redeem', title: 'Redeem' },
		{ key: 'genesis', title: 'Genesis' },
		{ key: 'signing-route', title: 'Signing route' },
		{ key: 'done', title: 'Done' }
	];
	const stepIndex = $derived(steps.findIndex((s) => s.key === step));
</script>

<svelte:head>
	<title>Onboard — Safe 1x1</title>
</svelte:head>

<div class="mx-auto max-w-3xl space-y-6 p-6">
	<div class="space-y-1">
		<h1 class="text-2xl font-semibold">Register a univocity instance</h1>
		<p class="text-sm text-zinc-600">
			Safe 1x1 (Mode D): your log root is a 1-of-1 Safe contract account. Every step signs in this
			browser via the Safe owner wallet — no custodial signer, no server in the middle.
		</p>
	</div>

	<ol class="flex flex-wrap gap-2 text-xs" aria-label="Wizard progress">
		{#each steps as s, i (s.key)}
			<li aria-current={i === stepIndex ? 'step' : undefined}>
				<Badge variant={i === stepIndex ? 'default' : i < stepIndex ? 'secondary' : 'outline'}>
					{i + 1}. {s.title}
				</Badge>
			</li>
		{/each}
	</ol>

	{#if error}
		<Alert variant="destructive" title="Onboarding">{error}</Alert>
	{/if}

	<Card class="p-6">
		<SafeWalletCard />
	</Card>

	{#if step === 'details'}
		<Card class="p-6">
			<div class="space-y-4">
				<h2 class="text-lg font-medium">Instance details</h2>
				<div class="flex flex-wrap gap-2" role="group" aria-label="Instance source">
					<Button
						variant={detailsMode === 'paste' ? 'default' : 'outline'}
						onclick={() => (detailsMode = 'paste')}
						aria-pressed={detailsMode === 'paste'}
					>
						I have an instance
					</Button>
					<Button
						variant={detailsMode === 'deploy' ? 'default' : 'outline'}
						onclick={() => (detailsMode = 'deploy')}
						aria-pressed={detailsMode === 'deploy'}
					>
						Deploy one now
					</Button>
				</div>
				{#if detailsMode === 'deploy'}
					<p class="text-sm text-zinc-600">
						Deploys a fresh ImutableUnivocity with your validated Safe as the
						<span class="font-mono">ks256</span> bootstrap key. The release manifest is fetched via
						the console and verified in this page before anything is signed; the deployment is
						proposed as a Safe transaction from your owner wallet. Prefer an external tool?
						<a
							class="underline"
							href="https://univocity-deploy.pages.dev"
							target="_blank"
							rel="noreferrer">univocity deploy</a
						> remains available.
					</p>
					<div class="grid gap-4 sm:grid-cols-2">
						<div class="space-y-2">
							<label class="block text-sm font-medium text-zinc-800" for="deploy-release-tag"
								>Release tag</label
							>
							<Input id="deploy-release-tag" bind:value={deployTag} placeholder="v0.1.8" />
							<p class="text-xs text-zinc-500">
								<!-- eslint-disable svelte/no-navigation-without-resolve -- external GitHub releases page -->
								<a
									class="underline"
									href={UNIVOCITY_RELEASES_PAGE_URL}
									target="_blank"
									rel="noreferrer">Browse univocity releases</a
								>
								<!-- eslint-enable svelte/no-navigation-without-resolve -->
							</p>
						</div>
						<div class="space-y-2">
							<label class="block text-sm font-medium text-zinc-800" for="deploy-instance-index"
								>Instance index</label
							>
							<Input id="deploy-instance-index" bind:value={deployIndex} placeholder="0" />
							<p class="text-xs text-zinc-500">
								Keep 0 unless you are deploying an additional instance of the same release with this
								Safe — the index changes the deterministic deploy address.
							</p>
						</div>
					</div>
					<Button onclick={prepareDeploy} disabled={busy || !safeReady}>
						{busy ? 'Verifying…' : 'Verify release & predict address'}
					</Button>
					{#if progress.deploy}
						<dl class="grid gap-2 text-sm sm:grid-cols-[auto_1fr]">
							<dt class="font-medium text-zinc-800">Release</dt>
							<dd class="font-mono">
								{progress.deploy.releaseTag} (instance index {progress.deploy.instanceIndex})
							</dd>
							<dt class="font-medium text-zinc-800">Predicted address</dt>
							<dd class="font-mono" data-testid="deploy-predicted-address">
								{progress.deploy.predictedAddress}
							</dd>
							{#if progress.deploy.safeTxHash}
								<dt class="font-medium text-zinc-800">SafeTx hash</dt>
								<dd class="font-mono">{progress.deploy.safeTxHash}</dd>
							{/if}
						</dl>
						{#if stsWarning}
							<Alert title="Proposal not recorded">{stsWarning}</Alert>
						{/if}
						{#if deployNotice}
							<Alert title="Not deployed yet">{deployNotice}</Alert>
						{/if}
						{#if alreadyDeployed}
							<Alert title="Deployed">
								Contract code found at the predicted address — this instance is already deployed.
								Continue with it below.
							</Alert>
							<Button onclick={adoptDeployedInstance} disabled={busy}>Use this instance</Button>
						{:else}
							{#if progress.deploy.proposed}
								<Alert title="Deployment proposed">
									The transaction is queued with the Safe Transaction Service. Execute it with your
									<!-- eslint-disable svelte/no-navigation-without-resolve -- external Safe app deep link -->
									Safe (<a
										class="underline"
										href={safeDashboardUrl(
											progress.deploy.safeAddress as Address,
											progress.deploy.safeTxHash as Hex
										)}
										target="_blank"
										rel="noreferrer">open in the Safe app</a
									>), then check for the deployment here.
									<!-- eslint-enable svelte/no-navigation-without-resolve -->
								</Alert>
							{/if}
							<div class="flex flex-wrap gap-2">
								<Button onclick={proposeDeploy} disabled={busy || !safeReady}>
									{busy
										? 'Proposing…'
										: progress.deploy.proposed
											? 'Re-propose to Safe'
											: 'Propose to Safe'}
								</Button>
								<Button variant="outline" onclick={checkDeployed} disabled={busy}>
									Check deployment
								</Button>
							</div>
						{/if}
					{/if}
				{:else}
					<p class="text-sm text-zinc-600">
						Paste the address of a deployed univocity contract, or switch to
						<em>Deploy one now</em> to deploy inline with your Safe. External deployment via
						<a
							class="underline"
							href="https://univocity-deploy.pages.dev"
							target="_blank"
							rel="noreferrer">univocity deploy</a
						>
						also works. The wizard verifies code exists at the address.
					</p>
					<div class="grid gap-4 sm:grid-cols-2">
						<div class="space-y-2">
							<label class="block text-sm font-medium text-zinc-800" for="onboard-chain-id"
								>Chain id</label
							>
							<Input id="onboard-chain-id" bind:value={progress.chainId} placeholder="84532" />
						</div>
						<div class="space-y-2">
							<label class="block text-sm font-medium text-zinc-800" for="onboard-univocity-addr"
								>Univocity contract address</label
							>
							<Input
								id="onboard-univocity-addr"
								bind:value={progress.univocityAddr}
								placeholder="0x…"
								class="font-mono"
							/>
						</div>
						<div class="space-y-2">
							<label class="block text-sm font-medium text-zinc-800" for="onboard-label"
								>Label</label
							>
							<Input
								id="onboard-label"
								bind:value={progress.label}
								placeholder="Names this request for the approving operator"
							/>
						</div>
						<div class="space-y-2">
							<label class="block text-sm font-medium text-zinc-800" for="onboard-contact-email"
								>Contact email</label
							>
							<Input
								id="onboard-contact-email"
								bind:value={progress.contactEmail}
								placeholder="you@example.com"
							/>
						</div>
					</div>
					<Button onclick={submitRequest} disabled={busy || !safeReady}>
						{busy ? 'Signing & submitting…' : 'Sign attestation & request onboarding'}
					</Button>
					{#if !safeReady}
						<p class="text-sm text-zinc-600">
							Connect the owner wallet and validate the Safe above to enable submission — the
							request carries an attestation signed by the Safe.
						</p>
					{/if}
				{/if}
			</div>
		</Card>
	{:else if step === 'awaiting-approval'}
		<Card class="p-6">
			<div class="space-y-3">
				<h2 class="text-lg font-medium">Awaiting approval</h2>
				<p class="text-sm text-zinc-600">{approvalCopy(progress.requestStatus)}</p>
				<p class="text-sm text-zinc-600">
					Request <span class="font-mono">{progress.requestId}</span> — status
					<Badge>{progress.requestStatus ?? 'pending'}</Badge>
				</p>
			</div>
		</Card>
	{:else if step === 'redeem'}
		<Card class="p-6">
			<div class="space-y-3">
				<h2 class="text-lg font-medium">Approved — redeem the onboard token</h2>
				<p class="text-sm text-zinc-600">{approvalCopy(progress.requestStatus)}</p>
				<Button onclick={redeem} disabled={busy}>{busy ? 'Redeeming…' : 'Redeem'}</Button>
			</div>
		</Card>
	{:else if step === 'genesis'}
		<Card class="p-6">
			<div class="space-y-3">
				<h2 class="text-lg font-medium">Genesis</h2>
				<p class="text-sm text-zinc-600">
					Registers the forest with your Safe address as the bootstrap key. Genesis itself is
					unsigned — the onboard token authorises it, and your Safe already attested the request.
				</p>
				{#if conflict}
					<Alert variant="destructive" title="Instance already claimed">
						<span class="font-mono">{conflict.univocityInstanceId}</span> is reserved or registered
						to another root: {conflict.detail}. If this is your instance registered from another
						session, resume there; otherwise contact ops to release the binding.
					</Alert>
				{/if}
				<Button onclick={runGenesis} disabled={busy || !safeReady}>
					{busy ? 'Registering…' : 'Run genesis'}
				</Button>
			</div>
		</Card>
	{:else if step === 'signing-route'}
		<Card class="p-6">
			<div class="space-y-3">
				<h2 class="text-lg font-medium">Route delegation approvals to this wallet</h2>
				<p class="text-sm text-zinc-600">
					Sets the log's signing route to <span class="font-mono">wallet</span>: delegation demands
					queue for interactive approval in this console instead of paging an agent signer. The
					owner wallet signs one SafeMessage to authorise the change.
				</p>
				{#if progress.publicRootRegistered === false}
					<Alert title="Coordinator registration pending">
						The coordinator has not recorded the log root yet — this step retries genesis first
						(idempotent for the same root).
					</Alert>
				{/if}
				<Button onclick={setWalletRoute} disabled={busy || !safeReady}>
					{busy ? 'Authorising…' : 'Set wallet signing route'}
				</Button>
			</div>
		</Card>
	{:else if step === 'done'}
		<Card class="p-6">
			<div class="space-y-3">
				<h2 class="text-lg font-medium">Instance registered</h2>
				<dl class="grid gap-2 text-sm sm:grid-cols-[auto_1fr]">
					<dt class="font-medium text-zinc-800">Instance</dt>
					<dd class="font-mono">{progress.univocityInstanceId}</dd>
					<dt class="font-medium text-zinc-800">Forest R</dt>
					<dd class="font-mono">{progress.forestR}</dd>
					<dt class="font-medium text-zinc-800">Log id</dt>
					<dd class="font-mono">{progress.logIdHex32}</dd>
				</dl>
				<div class="flex flex-wrap gap-2">
					<!-- eslint-disable svelte/no-navigation-without-resolve -- query strings appended after resolved base paths -->
					<a
						href={`${resolve('/fees')}?instance=${encodeURIComponent(progress.univocityInstanceId ?? '')}`}
					>
						<Button>Buy credits</Button>
					</a>
					<a
						href={`${resolve('/delegations')}?authLogId=${encodeURIComponent(progress.logIdHex32 ?? '')}`}
					>
						<Button variant="outline">Approve delegations</Button>
					</a>
					<!-- eslint-enable svelte/no-navigation-without-resolve -->
				</div>
			</div>
		</Card>
	{:else if step === 'failed'}
		<Card class="p-6">
			<div class="space-y-3">
				<h2 class="text-lg font-medium">Request {progress.requestStatus}</h2>
				<p class="text-sm text-zinc-600">{approvalCopy(progress.requestStatus)}</p>
			</div>
		</Card>
	{/if}

	{#if step !== 'details'}
		<Button variant="outline" onclick={startOver} disabled={busy}>Start over</Button>
	{/if}
</div>
