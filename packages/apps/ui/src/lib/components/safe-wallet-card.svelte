<script lang="ts">
	import Alert from '$lib/components/ui/alert.svelte';
	import Badge from '$lib/components/ui/badge.svelte';
	import Button from '$lib/components/ui/button.svelte';
	import Input from '$lib/components/ui/input.svelte';
	import {
		connectInjectedWallet,
		disconnectInjectedWallet,
		getInjectedWalletState,
		initInjectedWallets,
		setSessionSafeAddress,
		validateSessionSafe
	} from '$lib/wallets/stores.svelte.js';
	import { onMount } from 'svelte';

	const wallet = $derived(getInjectedWalletState());

	let safeInput = $state('');
	let validating = $state(false);

	onMount(async () => {
		await initInjectedWallets();
		safeInput = getInjectedWalletState().safeAddress;
	});

	async function validateSafe() {
		validating = true;
		try {
			setSessionSafeAddress(safeInput);
			await validateSessionSafe();
		} finally {
			validating = false;
		}
	}
</script>

<div class="space-y-4">
	<div class="flex items-center justify-between gap-4">
		<h2 class="text-lg font-medium">External wallet + Safe</h2>
		{#if wallet.address}
			<Badge>{wallet.address.slice(0, 6)}…{wallet.address.slice(-4)}</Badge>
		{/if}
	</div>
	<p class="text-sm text-zinc-600">
		Your log root is a 1-of-1 Safe contract account. The connected wallet is its owner: it signs
		EIP-712 SafeMessages that the Safe validates on-chain — no custodial signer anywhere.
	</p>
	{#if wallet.error}
		<Alert variant="destructive" title="Wallet">{wallet.error}</Alert>
	{/if}
	{#if wallet.address}
		<div class="flex items-center gap-3 text-sm text-zinc-600">
			<span>{wallet.providerName}</span>
			{#if wallet.chainId !== null}
				<span>· chainId {wallet.chainId}</span>
			{/if}
			<Button variant="outline" onclick={() => disconnectInjectedWallet()}>Disconnect</Button>
		</div>
		<div class="space-y-2">
			<label class="block text-sm font-medium text-zinc-800" for="safe-address">Safe address</label>
			<div class="flex gap-2">
				<Input
					id="safe-address"
					bind:value={safeInput}
					placeholder="0x… (1-of-1 Safe owned by the connected wallet)"
					class="flex-1 font-mono"
				/>
				<Button onclick={validateSafe} disabled={validating || !safeInput.trim()}>
					{validating ? 'Validating…' : 'Validate'}
				</Button>
			</div>
			{#if wallet.safeValidation}
				{#if wallet.safeValidation.status === 'valid'}
					<Badge>Safe validated — 1-of-1, owner confirmed</Badge>
				{:else if wallet.safeValidation.status === 'invalid'}
					<Alert variant="destructive" title="Safe not usable">
						{wallet.safeValidation.detail}
					</Alert>
				{:else}
					<Alert title="Could not reach the chain">
						{wallet.safeValidation.detail} — this is an availability problem, not a verdict on the Safe.
						Retry once the RPC is reachable.
					</Alert>
				{/if}
			{/if}
		</div>
	{:else if wallet.providers.length === 0 && wallet.ready}
		<Alert title="No injected wallet found">
			Install a browser wallet (MetaMask or compatible) to connect the Safe owner.
		</Alert>
	{:else}
		<div class="flex flex-wrap gap-2">
			{#each wallet.providers as detail (detail.info.rdns)}
				<Button
					disabled={wallet.connecting}
					onclick={() => connectInjectedWallet(detail.info.rdns)}
				>
					{wallet.connecting ? 'Connecting…' : `Connect ${detail.info.name}`}
				</Button>
			{/each}
		</div>
	{/if}
</div>
