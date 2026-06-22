<script lang="ts">
	import { page } from '$app/state';
	import Alert from '$lib/components/ui/alert.svelte';
	import Badge from '$lib/components/ui/badge.svelte';
	import Button from '$lib/components/ui/button.svelte';
	import Card from '$lib/components/ui/card.svelte';
	import Input from '$lib/components/ui/input.svelte';
	import { listPendingDelegations, submitDelegationMaterial } from '$lib/coordinator/client.js';
	import type { PendingEntry } from '@mandate/coordinator-types';
	import {
		getPrivySessionState,
		initPrivySession,
		loginWithEmail,
		logoutPrivy
	} from '$lib/privy/stores.svelte.js';
	import { buildKs256SigStructureHash, bytesToBase64 } from '$lib/signing/ks256-payload.js';
	import { PrivyEoaBackend } from '$lib/signing/privy-eoa-backend.js';
	import { onMount } from 'svelte';

	let authLogId = $state('');
	let email = $state('');
	let entries = $state<PendingEntry[]>([]);
	let loading = $state(false);
	let message = $state<string | null>(null);
	let error = $state<string | null>(null);
	let signingId = $state<string | null>(null);

	const session = $derived(getPrivySessionState());

	onMount(() => {
		void initPrivySession();
		const fromQuery = page.url.searchParams.get('authLogId');
		if (fromQuery) authLogId = fromQuery;
	});

	async function connectWallet() {
		error = null;
		try {
			await loginWithEmail(email.trim());
		} catch (err) {
			error = err instanceof Error ? err.message : 'Login failed';
		}
	}

	async function loadPending() {
		if (!authLogId.trim()) {
			error = 'Enter an authority log ID';
			return;
		}
		loading = true;
		error = null;
		message = null;
		try {
			const result = await listPendingDelegations(authLogId.trim());
			entries = result.entries;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load pending delegations';
			entries = [];
		} finally {
			loading = false;
		}
	}

	async function signAndSubmit(entry: PendingEntry) {
		if (!session.authenticated) {
			error = 'Connect a wallet before signing';
			return;
		}
		signingId = entry.id;
		error = null;
		message = null;
		try {
			const payload = new TextEncoder().encode(
				`${entry.logIdHex32}:${entry.mmrStart}:${entry.mmrEnd}:${entry.delegatedPublicKeyHash}`
			);
			const hash = buildKs256SigStructureHash(payload);
			const backend = new PrivyEoaBackend();
			const signature = await backend.signKs256Hash(hash);
			const signatureBytes = Uint8Array.from(
				(signature.slice(2).match(/.{1,2}/g) ?? []).map((byte) => parseInt(byte, 16))
			);
			const now = Math.floor(Date.now() / 1000);
			await submitDelegationMaterial({
				logId: entry.logIdHex32,
				mmrStart: entry.mmrStart,
				mmrEnd: entry.mmrEnd,
				delegatedPublicKey: bytesToBase64(new Uint8Array(32)),
				certificate: bytesToBase64(signatureBytes),
				issuedAt: now,
				expiresAt: now + 86400
			});
			message = `Submitted material for ${entry.logIdHex32.slice(0, 8)}…`;
			await loadPending();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Sign and submit failed';
		} finally {
			signingId = null;
		}
	}
</script>

<div class="mx-auto flex max-w-5xl flex-col gap-6 p-6">
	<div class="flex flex-col gap-2">
		<h1 class="text-2xl font-semibold tracking-tight">Delegation console</h1>
		<p class="text-sm text-zinc-600">
			Proactively sign delegation material for your authority log via the coordinator BFF.
		</p>
	</div>

	<Card class="space-y-4 p-6">
		<h2 class="text-lg font-medium">Authority log</h2>
		<div class="flex flex-col gap-3 sm:flex-row">
			<Input bind:value={authLogId} placeholder="Auth log UUID or 32-char hex" class="flex-1" />
			<Button onclick={loadPending} disabled={loading}>Load pending</Button>
		</div>
	</Card>

	<Card class="space-y-4 p-6">
		<div class="flex items-center justify-between gap-4">
			<h2 class="text-lg font-medium">Wallet</h2>
			{#if session.address}
				<Badge>{session.address.slice(0, 6)}…{session.address.slice(-4)}</Badge>
			{/if}
		</div>
		{#if session.error}
			<Alert variant="destructive" title="Privy">{session.error}</Alert>
		{/if}
		{#if session.authenticated}
			<Button variant="outline" onclick={() => logoutPrivy()}>Disconnect</Button>
		{:else}
			<div class="flex flex-col gap-3 sm:flex-row">
				<Input bind:value={email} type="email" placeholder="Email for Privy login" class="flex-1" />
				<Button onclick={connectWallet}>Connect wallet</Button>
			</div>
		{/if}
	</Card>

	{#if error}
		<Alert variant="destructive" title="Error">{error}</Alert>
	{/if}
	{#if message}
		<Alert title="Success">{message}</Alert>
	{/if}

	<Card class="overflow-hidden p-0">
		<div class="border-b border-zinc-200 px-6 py-4">
			<h2 class="text-lg font-medium">Pending delegations</h2>
		</div>
		{#if loading}
			<p class="px-6 py-8 text-sm text-zinc-500">Loading…</p>
		{:else if entries.length === 0}
			<p class="px-6 py-8 text-sm text-zinc-500">No pending entries for this authority log.</p>
		{:else}
			<div class="overflow-x-auto">
				<table class="min-w-full text-left text-sm">
					<thead class="bg-zinc-50 text-zinc-600">
						<tr>
							<th class="px-4 py-3 font-medium">Log</th>
							<th class="px-4 py-3 font-medium">MMR range</th>
							<th class="px-4 py-3 font-medium">Requested</th>
							<th class="px-4 py-3 font-medium"></th>
						</tr>
					</thead>
					<tbody>
						{#each entries as entry (entry.id)}
							<tr class="border-t border-zinc-100">
								<td class="px-4 py-3 font-mono text-xs">{entry.logIdHex32.slice(0, 12)}…</td>
								<td class="px-4 py-3">{entry.mmrStart} – {entry.mmrEnd}</td>
								<td class="px-4 py-3">{new Date(entry.requestedAt * 1000).toLocaleString()}</td>
								<td class="px-4 py-3 text-right">
									<Button
										variant="secondary"
										disabled={signingId === entry.id}
										onclick={() => signAndSubmit(entry)}
									>
										{signingId === entry.id ? 'Signing…' : 'Sign & submit'}
									</Button>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</Card>
</div>
