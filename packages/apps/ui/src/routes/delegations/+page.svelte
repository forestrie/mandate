<script lang="ts">
	import { page } from '$app/state';
	import Alert from '$lib/components/ui/alert.svelte';
	import Badge from '$lib/components/ui/badge.svelte';
	import Button from '$lib/components/ui/button.svelte';
	import Card from '$lib/components/ui/card.svelte';
	import Input from '$lib/components/ui/input.svelte';
	import {
		getLogDelegationEnabled,
		listPendingDelegations,
		setLogDelegationEnabled,
		submitDelegationCertificate
	} from '$lib/coordinator/client.js';
	import {
		buildBrowserDelegationCertificate,
		pendingEntryToDelegationInput
	} from '$lib/signing/build-browser-delegation-certificate.js';
	import type { EnabledResponse, PendingEntry } from '@mandate/coordinator-types';
	import {
		getPrivySessionState,
		initPrivySession,
		sendEmailLoginCode,
		completeEmailLogin,
		logoutPrivy
	} from '$lib/privy/stores.svelte.js';
	import { PrivyEoaBackend } from '$lib/signing/privy-eoa-backend.js';
	import { buildSubmitCertificateBodyFromCert } from './submit-payload.js';
	import {
		enabledBadgeLabels,
		effectiveEnabledVariant,
		loadRowStatus,
		matchesStatusFilter,
		reconcileRowStatus,
		saveRowStatus,
		statusLabel,
		statusVariant,
		type RowStatus,
		type StatusFilter
	} from './delegation-console-state.js';
	import { killSwitchGuidance, KILL_SWITCH_RUNBOOK_URL } from './mode-c-revoke-spike.js';
	import { onMount } from 'svelte';

	let authLogId = $state('');
	let email = $state('');
	let otpCode = $state('');
	let otpSent = $state(false);
	let otpBusy = $state(false);
	let entries = $state<PendingEntry[]>([]);
	let loading = $state(false);
	let message = $state<string | null>(null);
	let error = $state<string | null>(null);
	let signingId = $state<string | null>(null);
	let killSwitchLogId = $state('');
	let killSwitchBusy = $state(false);
	let logFilter = $state('');
	let statusFilter = $state<StatusFilter>('all');
	let rowStatus = $state<Record<string, RowStatus>>({});
	let enabledByLogId = $state<Record<string, EnabledResponse>>({});

	const session = $derived(getPrivySessionState());
	const killSwitch = $derived(killSwitchGuidance());

	function openKillSwitchRunbook() {
		window.open(KILL_SWITCH_RUNBOOK_URL, '_blank', 'noopener,noreferrer');
	}

	const filteredEntries = $derived(
		entries.filter((entry) => {
			const matchesLog =
				!logFilter.trim() ||
				entry.logIdHex32.toLowerCase().includes(logFilter.trim().toLowerCase());
			const status = rowStatus[entry.id] ?? 'pending';
			return matchesLog && matchesStatusFilter(status, statusFilter);
		})
	);

	onMount(() => {
		void initPrivySession();
		const fromQuery = page.url.searchParams.get('authLogId');
		if (fromQuery) {
			authLogId = fromQuery;
			rowStatus = loadRowStatus(fromQuery);
		}
	});

	function persistRowStatus() {
		if (!authLogId.trim()) return;
		saveRowStatus(authLogId.trim(), rowStatus);
	}

	function statusFor(entry: PendingEntry): RowStatus {
		return rowStatus[entry.id] ?? 'pending';
	}

	async function refreshEnabledForLogs(logIds: string[]) {
		const unique = [...new Set(logIds)];
		const results = await Promise.all(
			unique.map(async (logId) => {
				try {
					return [logId, await getLogDelegationEnabled(logId)] as const;
				} catch {
					return null;
				}
			})
		);
		const next = { ...enabledByLogId };
		for (const item of results) {
			if (item) next[item[0]] = item[1];
		}
		enabledByLogId = next;
	}

	async function sendLoginCode() {
		error = null;
		otpBusy = true;
		try {
			await sendEmailLoginCode(email.trim());
			otpSent = true;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to send verification code';
		} finally {
			otpBusy = false;
		}
	}

	async function connectWallet() {
		error = null;
		otpBusy = true;
		try {
			await completeEmailLogin(email.trim(), otpCode);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Login failed';
		} finally {
			otpBusy = false;
		}
	}

	async function disconnectWallet() {
		await logoutPrivy();
		otpSent = false;
		otpCode = '';
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
			const trimmedAuthLogId = authLogId.trim();
			const stored = loadRowStatus(trimmedAuthLogId);
			const result = await listPendingDelegations(trimmedAuthLogId);
			entries = result.entries;
			rowStatus = reconcileRowStatus(
				stored,
				result.entries.map((entry) => entry.id)
			);
			persistRowStatus();
			await refreshEnabledForLogs(result.entries.map((entry) => entry.logIdHex32));
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load pending delegations';
			entries = [];
		} finally {
			loading = false;
		}
	}

	async function pauseUserSigning() {
		const logId = killSwitchLogId.trim();
		if (!logId) {
			error = 'Enter a user log ID to pause signing';
			return;
		}
		await pauseOperatorSigning(logId);
	}

	async function pauseOperatorSigning(logId: string) {
		killSwitchBusy = true;
		error = null;
		message = null;
		try {
			const response = await setLogDelegationEnabled(logId, false);
			enabledByLogId = { ...enabledByLogId, [logId]: response };
			message = `Signing paused for log ${logId.slice(0, 8)}…`;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to pause signing';
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
			const response = await setLogDelegationEnabled(logId, true);
			enabledByLogId = { ...enabledByLogId, [logId]: response };
			message = `Signing resumed for log ${logId.slice(0, 8)}…`;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to resume signing';
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
		persistRowStatus();
		error = null;
		message = null;
		try {
			const now = Math.floor(Date.now() / 1000);
			const input = pendingEntryToDelegationInput(entry, now);
			const backend = new PrivyEoaBackend();
			const certificate = await buildBrowserDelegationCertificate(input, session.address, backend);
			await submitDelegationCertificate(buildSubmitCertificateBodyFromCert(entry, certificate));
			rowStatus = { ...rowStatus, [entry.id]: 'signed' };
			persistRowStatus();
			message = `Submitted certificate for ${entry.logIdHex32.slice(0, 8)}…`;
			await loadPending();
		} catch (err) {
			rowStatus = { ...rowStatus, [entry.id]: 'failed' };
			persistRowStatus();
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
			Proactively sign delegation certificates for your authority log via the coordinator BFF.
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
			<Button variant="outline" onclick={() => disconnectWallet()}>Disconnect</Button>
		{:else}
			<div class="flex flex-col gap-3">
				<div class="flex flex-col gap-3 sm:flex-row">
					<Input
						bind:value={email}
						type="email"
						placeholder="Email for Privy login"
						class="flex-1"
					/>
					<Button variant="outline" disabled={otpBusy || !email.trim()} onclick={sendLoginCode}>
						{otpSent ? 'Resend code' : 'Send code'}
					</Button>
				</div>
				{#if otpSent}
					<div class="flex flex-col gap-3 sm:flex-row">
						<Input
							bind:value={otpCode}
							data-testid="privy-otp"
							type="password"
							inputmode="numeric"
							maxlength={8}
							placeholder="Verification code"
							class="flex-1"
							autocomplete="one-time-code"
						/>
						<Button disabled={otpBusy || !otpCode.trim()} onclick={connectWallet}>
							Connect wallet
						</Button>
					</div>
				{/if}
			</div>
		{/if}
	</Card>

	<Card class="space-y-4 p-6">
		<h2 class="text-lg font-medium">Kill switch</h2>
		<div class="space-y-3">
			<div>
				<p class="text-sm font-medium text-zinc-800">{killSwitch.coordinatorTitle}</p>
				<p class="text-sm text-zinc-600">{killSwitch.coordinatorBody}</p>
			</div>
			<div>
				<p class="text-sm font-medium text-zinc-800">{killSwitch.custodyTitle}</p>
				<p class="text-sm text-zinc-600">{killSwitch.custodyBody}</p>
				<p class="mt-2 text-sm text-zinc-600">
					CLI:
					<code class="rounded bg-zinc-100 px-1 py-0.5 text-xs">{killSwitch.custodyCliCommand}</code
					>
					·
					<button type="button" class="text-blue-600 underline" onclick={openKillSwitchRunbook}
						>exit runbook</button
					>
				</p>
			</div>
		</div>
		<div class="flex flex-col gap-3 sm:flex-row">
			<Input
				bind:value={killSwitchLogId}
				placeholder="User log UUID or 32-char hex"
				class="flex-1"
			/>
			<Button variant="outline" disabled={killSwitchBusy} onclick={() => pauseUserSigning()}>
				Pause signing
			</Button>
			<Button variant="outline" disabled={killSwitchBusy} onclick={() => resumeOperatorSigning()}>
				Resume signing
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
			<div class="flex flex-col gap-2 sm:flex-row">
				<Input
					bind:value={logFilter}
					placeholder="Filter by log id…"
					class="max-w-xs"
					disabled={entries.length === 0}
				/>
				<select
					class="h-9 rounded-md border border-zinc-200 bg-white px-3 text-sm disabled:opacity-50"
					bind:value={statusFilter}
					disabled={entries.length === 0}
				>
					<option value="all">All statuses</option>
					<option value="pending">Pending</option>
					<option value="signing">Signing</option>
					<option value="signed">Submitted</option>
					<option value="failed">Failed</option>
				</select>
			</div>
		</div>
		{#if loading}
			<p class="px-6 py-8 text-sm text-zinc-500">Loading…</p>
		{:else if entries.length === 0}
			<p class="px-6 py-8 text-sm text-zinc-500">No pending entries for this authority log.</p>
		{:else if filteredEntries.length === 0}
			<p class="px-6 py-8 text-sm text-zinc-500">No entries match the current filters.</p>
		{:else}
			<div class="overflow-x-auto">
				<table class="min-w-full text-left text-sm">
					<thead class="bg-zinc-50 text-zinc-600">
						<tr>
							<th class="px-4 py-3 font-medium">Log</th>
							<th class="px-4 py-3 font-medium">MMR range</th>
							<th class="px-4 py-3 font-medium">Requested</th>
							<th class="px-4 py-3 font-medium">Enabled</th>
							<th class="px-4 py-3 font-medium">Status</th>
							<th class="px-4 py-3 font-medium"></th>
							<th class="px-4 py-3 font-medium"></th>
						</tr>
					</thead>
					<tbody>
						{#each filteredEntries as entry (entry.id)}
							{@const status = statusFor(entry)}
							{@const enabled = enabledByLogId[entry.logIdHex32]}
							<tr class="border-t border-zinc-100">
								<td class="px-4 py-3 font-mono text-xs">{entry.logIdHex32.slice(0, 12)}…</td>
								<td class="px-4 py-3">{entry.mmrStart} – {entry.mmrEnd}</td>
								<td class="px-4 py-3">{new Date(entry.requestedAt * 1000).toLocaleString()}</td>
								<td class="px-4 py-3">
									{#if enabled}
										{@const labels = enabledBadgeLabels(enabled)}
										<div class="flex flex-wrap gap-1">
											<Badge variant={effectiveEnabledVariant(enabled.enabled)}>
												{labels.effective}
											</Badge>
											<Badge variant="outline">{labels.user}</Badge>
											<Badge variant="outline">{labels.operator}</Badge>
										</div>
									{:else}
										<span class="text-xs text-zinc-400">—</span>
									{/if}
								</td>
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
										disabled={signingId === entry.id ||
											status === 'signed' ||
											status === 'submitted'}
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
