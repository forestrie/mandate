<script lang="ts">
	import { page } from '$app/state';
	import Alert from '$lib/components/ui/alert.svelte';
	import Badge from '$lib/components/ui/badge.svelte';
	import Button from '$lib/components/ui/button.svelte';
	import Card from '$lib/components/ui/card.svelte';
	import Input from '$lib/components/ui/input.svelte';
	import {
		listPendingDelegations,
		setLogDelegationEnabled,
		submitDelegationCertificate
	} from '$lib/coordinator/client.js';
	import {
		buildBrowserDelegationCertificate,
		pendingEntryToDelegationInput
	} from '$lib/signing/build-browser-delegation-certificate.js';
	import { bytesToBase64 } from '$lib/signing/bytes.js';
	import type { PendingEntry } from '@mandate/coordinator-types';
	import {
		getPrivySessionState,
		initPrivySession,
		loginWithEmail,
		logoutPrivy
	} from '$lib/privy/stores.svelte.js';
	import { PrivyEoaBackend } from '$lib/signing/privy-eoa-backend.js';
	import { buildSubmitCertificateBody } from './submit-payload.js';
	import { onMount } from 'svelte';

	type RowStatus = 'pending' | 'signing' | 'signed' | 'failed';

	let authLogId = $state('');
	let email = $state('');
	let entries = $state<PendingEntry[]>([]);
	let loading = $state(false);
	let message = $state<string | null>(null);
	let error = $state<string | null>(null);
	let signingId = $state<string | null>(null);
	let killSwitchLogId = $state('');
	let killSwitchBusy = $state(false);
	let logFilter = $state('');
	let rowStatus = $state<Record<string, RowStatus>>({});

	const session = $derived(getPrivySessionState());

	const filteredEntries = $derived(
		logFilter.trim()
			? entries.filter((entry) =>
					entry.logIdHex32.toLowerCase().includes(logFilter.trim().toLowerCase())
				)
			: entries
	);

	onMount(() => {
		void initPrivySession();
		const fromQuery = page.url.searchParams.get('authLogId');
		if (fromQuery) authLogId = fromQuery;
	});

	function statusFor(entry: PendingEntry): RowStatus {
		return rowStatus[entry.id] ?? 'pending';
	}

	function statusLabel(status: RowStatus): string {
		switch (status) {
			case 'signing':
				return 'Signing…';
			case 'signed':
				return 'Submitted';
			case 'failed':
				return 'Failed';
			default:
				return 'Pending';
		}
	}

	function statusVariant(status: RowStatus): 'default' | 'secondary' | 'outline' {
		switch (status) {
			case 'signed':
				return 'default';
			case 'signing':
				return 'secondary';
			case 'failed':
				return 'outline';
			default:
				return 'outline';
		}
	}

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
			rowStatus = Object.fromEntries(
				result.entries.map((entry) => [entry.id, rowStatus[entry.id] ?? 'pending'])
			);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load pending delegations';
			entries = [];
		} finally {
			loading = false;
		}
	}

	async function pauseOperatorSigning(logId: string) {
		killSwitchBusy = true;
		error = null;
		message = null;
		try {
			await setLogDelegationEnabled(logId, false);
			message = `Operator signing paused for log ${logId.slice(0, 8)}…`;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to pause operator signing';
		} finally {
			killSwitchBusy = false;
		}
	}

	async function resumeOperatorSigning() {
		const logId = killSwitchLogId.trim();
		if (!logId) {
			error = 'Enter a user log ID to resume operator signing';
			return;
		}
		killSwitchBusy = true;
		error = null;
		message = null;
		try {
			await setLogDelegationEnabled(logId, true);
			message = `Operator signing resumed for log ${logId.slice(0, 8)}…`;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to resume operator signing';
		} finally {
			killSwitchBusy = false;
		}
	}

	async function signAndSubmit(entry: PendingEntry) {
		if (!session.authenticated || !session.address) {
			error = 'Connect a wallet before signing';
			return;
		}
		signingId = entry.id;
		rowStatus = { ...rowStatus, [entry.id]: 'signing' };
		error = null;
		message = null;
		try {
			const now = Math.floor(Date.now() / 1000);
			const input = pendingEntryToDelegationInput(entry, now);
			const backend = new PrivyEoaBackend();
			const certificate = await buildBrowserDelegationCertificate(input, session.address, backend);
			await submitDelegationCertificate(
				buildSubmitCertificateBody(entry, bytesToBase64(certificate), now)
			);
			rowStatus = { ...rowStatus, [entry.id]: 'signed' };
			message = `Submitted certificate for ${entry.logIdHex32.slice(0, 8)}…`;
			await loadPending();
		} catch (err) {
			rowStatus = { ...rowStatus, [entry.id]: 'failed' };
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

	<Card class="space-y-4 p-6">
		<h2 class="text-lg font-medium">Kill switch (FOR-114)</h2>
		<!-- Coordinator pause/resume uses operator BFF auth (COORDINATOR_APP_TOKEN), not per-user wallet proof (ADR-0001 / FOR-129). -->
		<p class="text-sm text-zinc-600">
			<strong>Coordinator (immediate, operator):</strong> pause mandate webhook signing for a user
			log — stops new <code class="text-xs">delegation.required</code> delivery. Use per-row
			<strong>Pause signing</strong> or resume below.
		</p>
		<p class="text-sm text-zinc-600">
			<strong>Privy custody layer (Mode C, operator-assisted until FOR-117):</strong> revoke mandate
			as an additional signer so
			<code class="text-xs">secp256k1_sign</code> fails at Privy (ARC-0022 I3). Run
			<code class="rounded bg-zinc-100 px-1 py-0.5 text-xs">task privy:revoke:mode-c</code>
			or see the
			<a
				href="https://github.com/forestrie/mandate/blob/main/docs/adr/adr-0005-byok-delegation-modes.md#operational-appendix--mode-c-kill-switch-and-exits-for-114"
				class="text-blue-600 underline"
				target="_blank"
				rel="noopener noreferrer">exit runbook</a
			>.
		</p>
		<div class="flex flex-col gap-3 sm:flex-row">
			<Input
				bind:value={killSwitchLogId}
				placeholder="User log UUID or 32-char hex"
				class="flex-1"
			/>
			<Button variant="outline" disabled={killSwitchBusy} onclick={() => resumeOperatorSigning()}>
				Resume operator signing
			</Button>
		</div>
	</Card>

	{#if error}
		<Alert variant="destructive" title="Error">{error}</Alert>
	{/if}
	{#if message}
		<Alert title="Success">{message}</Alert>
	{/if}

	<Card class="overflow-hidden p-0">
		<div
			class="flex flex-col gap-3 border-b border-zinc-200 px-6 py-4 sm:flex-row sm:items-center sm:justify-between"
		>
			<h2 class="text-lg font-medium">Pending delegations</h2>
			<Input
				bind:value={logFilter}
				placeholder="Filter by log id…"
				class="max-w-xs"
				disabled={entries.length === 0}
			/>
		</div>
		{#if loading}
			<p class="px-6 py-8 text-sm text-zinc-500">Loading…</p>
		{:else if entries.length === 0}
			<p class="px-6 py-8 text-sm text-zinc-500">No pending entries for this authority log.</p>
		{:else if filteredEntries.length === 0}
			<p class="px-6 py-8 text-sm text-zinc-500">No entries match the log filter.</p>
		{:else}
			<div class="overflow-x-auto">
				<table class="min-w-full text-left text-sm">
					<thead class="bg-zinc-50 text-zinc-600">
						<tr>
							<th class="px-4 py-3 font-medium">Log</th>
							<th class="px-4 py-3 font-medium">MMR range</th>
							<th class="px-4 py-3 font-medium">Requested</th>
							<th class="px-4 py-3 font-medium">Status</th>
							<th class="px-4 py-3 font-medium"></th>
							<th class="px-4 py-3 font-medium"></th>
						</tr>
					</thead>
					<tbody>
						{#each filteredEntries as entry (entry.id)}
							{@const status = statusFor(entry)}
							<tr class="border-t border-zinc-100">
								<td class="px-4 py-3 font-mono text-xs">{entry.logIdHex32.slice(0, 12)}…</td>
								<td class="px-4 py-3">{entry.mmrStart} – {entry.mmrEnd}</td>
								<td class="px-4 py-3">{new Date(entry.requestedAt * 1000).toLocaleString()}</td>
								<td class="px-4 py-3">
									<Badge
										variant={statusVariant(status)}
										class={status === 'failed' ? 'border-red-300 text-red-700' : undefined}
									>
										{statusLabel(status)}
									</Badge>
								</td>
								<td class="px-4 py-3 text-right">
									<Button
										variant="secondary"
										disabled={signingId === entry.id || status === 'signed'}
										onclick={() => signAndSubmit(entry)}
									>
										{signingId === entry.id ? 'Signing…' : 'Sign & submit'}
									</Button>
								</td>
								<td class="px-4 py-3 text-right">
									<Button
										variant="outline"
										disabled={killSwitchBusy}
										onclick={() => pauseOperatorSigning(entry.logIdHex32)}
									>
										Pause signing
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
