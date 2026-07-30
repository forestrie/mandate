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
		applyGenesisResult,
		approvalCopy,
		classifyRedeemFailure,
		clearProgress,
		deriveStep,
		emptyProgress,
		ensureForestR,
		loadProgress,
		normalizeUnivocityAddrInput,
		pinnedSafeGuard,
		repairFailureCopy,
		saveProgress,
		scrubProgressSecrets,
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
				<p class="text-sm text-zinc-600">
					The univocity contract is deployed outside the console — use
					<a
						class="underline"
						href="https://univocity-deploy.pages.dev"
						target="_blank"
						rel="noreferrer">univocity deploy</a
					>
					if you have not deployed one yet. The wizard verifies code exists at the address.
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
						<label class="block text-sm font-medium text-zinc-800" for="onboard-label">Label</label>
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
						Connect the owner wallet and validate the Safe above to enable submission — the request
						carries an attestation signed by the Safe.
					</p>
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
