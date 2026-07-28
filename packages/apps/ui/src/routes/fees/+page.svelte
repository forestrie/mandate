<script lang="ts">
	import { page } from '$app/state';
	import Alert from '$lib/components/ui/alert.svelte';
	import Badge from '$lib/components/ui/badge.svelte';
	import Button from '$lib/components/ui/button.svelte';
	import Card from '$lib/components/ui/card.svelte';
	import Input from '$lib/components/ui/input.svelte';
	import {
		fetchFeeAccount,
		requestCreditsChallenge,
		submitCreditsPayment,
		type CreditsChallenge,
		type FeeAccountRead
	} from '$lib/payments/canopy-client.js';
	import { mintAccountReadAuthorization } from '$lib/payments/account-read-auth.js';
	import { signX402PaymentTypedData } from '$lib/payments/x402-payer.js';
	import { getConnectedEthereumProvider, getConnectedWalletAddress } from '$lib/privy/client.js';
	import {
		getPrivySessionState,
		initPrivySession,
		sendEmailLoginCode,
		completeEmailLogin
	} from '$lib/privy/stores.svelte.js';
	import { isBurnerBackend } from '$lib/signing/resolve-backend.js';
	import { isUnivocityInstanceId } from '@mandate/register/univocity-instance-id';
	import { onDestroy, onMount } from 'svelte';
	import {
		creditsLanded,
		DEFAULT_CREDITS_PER_PURCHASE,
		enforcementBadge,
		formatUsdcAtomic,
		hasArrears,
		loadStoredInstanceId,
		MAX_CREDITS_PER_PURCHASE,
		parseCreditsInput,
		registrationBlockLabel,
		saveStoredInstanceId,
		SETTLEMENT_POLL_INTERVAL_MS,
		SETTLEMENT_POLL_LIMIT
	} from './fee-account-state.js';

	let instanceId = $state('');
	let account = $state<FeeAccountRead | null>(null);
	let loading = $state(false);
	let message = $state<string | null>(null);
	let error = $state<string | null>(null);

	let creditsInput = $state(String(DEFAULT_CREDITS_PER_PURCHASE));
	let challenge = $state<CreditsChallenge | null>(null);
	let purchasing = $state(false);
	let pollTimer = $state<ReturnType<typeof setTimeout> | null>(null);
	let pollCount = $state(0);

	let email = $state('');
	let otpCode = $state('');
	let otpSent = $state(false);
	let otpBusy = $state(false);

	const session = $derived(getPrivySessionState());
	const burnerMode = isBurnerBackend();
	const instanceValid = $derived(isUnivocityInstanceId(instanceId.trim()));
	const credits = $derived(parseCreditsInput(creditsInput));
	const frozen = $derived(account ? enforcementBadge(account) : null);

	onMount(() => {
		if (!burnerMode) void initPrivySession();
		const fromQuery = page.url.searchParams.get('instance');
		instanceId = fromQuery || loadStoredInstanceId();
		if (instanceId && !burnerMode) {
			// Balance loads lazily — the wallet may not be connected yet.
		}
	});

	onDestroy(() => stopPolling());

	function stopPolling() {
		if (pollTimer) clearTimeout(pollTimer);
		pollTimer = null;
		pollCount = 0;
	}

	async function sendOtp() {
		otpBusy = true;
		error = null;
		try {
			await sendEmailLoginCode(email);
			otpSent = true;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to send login code';
		} finally {
			otpBusy = false;
		}
	}

	async function submitOtp() {
		otpBusy = true;
		error = null;
		try {
			await completeEmailLogin(email, otpCode);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Login failed';
		} finally {
			otpBusy = false;
		}
	}

	async function loadAccount(silent = false) {
		if (!instanceValid) {
			error = 'Enter a canonical univocity instance id (eip155:{chainId}:0x{40 lowercase hex})';
			return null;
		}
		const id = instanceId.trim();
		if (!silent) {
			loading = true;
			message = null;
			error = null;
		}
		try {
			saveStoredInstanceId(id);
			const authorization = await mintAccountReadAuthorization(id);
			const read = await fetchFeeAccount(id, authorization);
			account = read;
			return read;
		} catch (err) {
			if (!silent) {
				error = err instanceof Error ? err.message : 'Failed to load fee account';
			}
			return null;
		} finally {
			if (!silent) loading = false;
		}
	}

	async function prepareChallenge() {
		if (!instanceValid || credits === null) return;
		purchasing = true;
		message = null;
		error = null;
		challenge = null;
		try {
			challenge = await requestCreditsChallenge(instanceId.trim(), credits);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to fetch purchase quote';
		} finally {
			purchasing = false;
		}
	}

	async function signAndPay() {
		if (!challenge || credits === null) return;
		purchasing = true;
		message = null;
		error = null;
		try {
			const provider = await getConnectedEthereumProvider();
			const payerAddress = await getConnectedWalletAddress();
			if (!provider || !payerAddress) {
				throw new Error('Connect the Privy wallet before purchasing credits.');
			}
			const before = account ?? (await loadAccount(true));
			const xPayment = await signX402PaymentTypedData(
				challenge.paymentRequiredB64,
				provider,
				payerAddress
			);
			const accepted = await submitCreditsPayment(instanceId.trim(), credits, xPayment);
			challenge = null;
			message = `Payment accepted (${formatUsdcAtomic(accepted.amountAtomic)} for ${accepted.credits} credits). Credits land after on-chain settlement — watching the balance…`;
			if (before) startSettlementPoll(before);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Credits purchase failed';
		} finally {
			purchasing = false;
		}
	}

	function startSettlementPoll(before: FeeAccountRead) {
		stopPolling();
		const tick = async () => {
			pollCount += 1;
			const read = await loadAccount(true);
			if (read && creditsLanded(before, read)) {
				message = `Credits landed: balance is now ${read.creditsBalance}.`;
				stopPolling();
				return;
			}
			if (pollCount >= SETTLEMENT_POLL_LIMIT) {
				message =
					'Settlement is still pending — the balance will update once the payment settles on-chain. Reload to check again.';
				stopPolling();
				return;
			}
			pollTimer = setTimeout(tick, SETTLEMENT_POLL_INTERVAL_MS);
		};
		pollTimer = setTimeout(tick, SETTLEMENT_POLL_INTERVAL_MS);
	}
</script>

<main class="mx-auto max-w-3xl space-y-6 px-6 py-8">
	<div>
		<h1 class="text-xl font-semibold">Fees</h1>
		<p class="mt-1 text-sm text-zinc-600">
			Fee-account posture for a univocity instance: prepaid credit balance, accrued checkpoints,
			arrears and the sealing kill-switch state. Reads are authorised by the instance's bootstrap
			key — the wallet this console signs with.
		</p>
	</div>

	{#if error}
		<Alert variant="destructive" title="Something went wrong">{error}</Alert>
	{/if}
	{#if message}
		<Alert>{message}</Alert>
	{/if}

	{#if !burnerMode && !session.authenticated}
		<Card class="space-y-4 p-6">
			<h2 class="font-medium">Sign in</h2>
			<p class="text-sm text-zinc-600">
				The fee-account read is signed by your Privy wallet — sign in to continue.
			</p>
			{#if !otpSent}
				<div class="flex gap-2">
					<Input type="email" placeholder="operator@example.com" bind:value={email} />
					<Button onclick={sendOtp} disabled={otpBusy || !email.trim()}>Send code</Button>
				</div>
			{:else}
				<div class="flex gap-2">
					<Input placeholder="One-time code" bind:value={otpCode} />
					<Button onclick={submitOtp} disabled={otpBusy || !otpCode.trim()}>Sign in</Button>
				</div>
			{/if}
		</Card>
	{/if}

	<Card class="space-y-4 p-6">
		<h2 class="font-medium">Instance</h2>
		<div class="flex gap-2">
			<Input
				placeholder="eip155:84532:0x…"
				bind:value={instanceId}
				aria-label="Univocity instance id"
			/>
			<Button onclick={() => loadAccount()} disabled={loading || !instanceValid}>
				{loading ? 'Loading…' : 'Load'}
			</Button>
		</div>
		{#if instanceId.trim() && !instanceValid}
			<p class="text-sm text-zinc-500">
				Expected the canonical form: eip155:{'{chainId}'}:0x{'{40 lowercase hex}'}
			</p>
		{/if}
	</Card>

	{#if account && frozen}
		<Card class="space-y-4 p-6">
			<div class="flex items-center justify-between">
				<h2 class="font-medium">Fee account</h2>
				<div class="flex gap-2">
					<Badge
						variant={frozen.variant}
						class={frozen.alarming ? 'border-red-300 text-red-700' : ''}
					>
						{frozen.label}
					</Badge>
					{#if hasArrears(account)}
						<Badge variant="outline" class="border-amber-300 text-amber-700">In arrears</Badge>
					{/if}
				</div>
			</div>
			<dl class="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
				<dt class="text-zinc-500">Credits balance</dt>
				<dd class="text-right font-medium">{account.creditsBalance}</dd>
				<dt class="text-zinc-500">Checkpoints accrued</dt>
				<dd class="text-right font-medium">{account.checkpointsAccrued}</dd>
				<dt class="text-zinc-500">Arrears</dt>
				<dd class="text-right font-medium">{account.arrears}</dd>
				<dt class="text-zinc-500">Watermark block</dt>
				<dd class="text-right font-medium">{account.watermarkBlock ?? '—'}</dd>
				<dt class="text-zinc-500">Registration floor</dt>
				<dd class="text-right font-medium">{registrationBlockLabel(account)}</dd>
			</dl>
			{#if frozen.alarming}
				<Alert variant="destructive" title="Sealing is frozen">
					This instance is out of credit (or manually frozen by ops). Sealing resumes once the
					account is topped up and the indexer unfreezes it — data reads are never blocked.
				</Alert>
			{/if}
		</Card>

		<Card class="space-y-4 p-6">
			<h2 class="font-medium">Buy credits</h2>
			{#if burnerMode}
				<p class="text-sm text-zinc-600">
					Credits purchase needs the Privy-backed wallet (typed-data signing); the demo burner
					wallet only reads. Use <code>forestrie</code> CLI to pay from a funded key instead.
				</p>
			{:else}
				<div class="flex items-end gap-2">
					<div class="flex-1">
						<label class="mb-1 block text-sm text-zinc-500" for="credits-count"
							>Credits (1–{MAX_CREDITS_PER_PURCHASE})</label
						>
						<Input id="credits-count" inputmode="numeric" bind:value={creditsInput} />
					</div>
					<Button
						variant="secondary"
						onclick={prepareChallenge}
						disabled={purchasing || credits === null}
					>
						Get quote
					</Button>
				</div>
				{#if challenge}
					<div
						class="flex items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm"
					>
						<span>
							{challenge.credits} credits —
							<span class="font-medium">{formatUsdcAtomic(challenge.amountAtomic)}</span> USDC
						</span>
						<Button onclick={signAndPay} disabled={purchasing}>
							{purchasing ? 'Signing…' : 'Sign & pay'}
						</Button>
					</div>
					<p class="text-xs text-zinc-500">
						Signing authorises a one-time USDC transfer of exactly this amount from your wallet.
						Credits are added once the payment settles on-chain.
					</p>
				{/if}
			{/if}
		</Card>
	{/if}
</main>
