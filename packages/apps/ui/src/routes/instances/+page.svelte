<script lang="ts">
	import Alert from '$lib/components/ui/alert.svelte';
	import Badge from '$lib/components/ui/badge.svelte';
	import Button from '$lib/components/ui/button.svelte';
	import Card from '$lib/components/ui/card.svelte';
	import Input from '$lib/components/ui/input.svelte';
	import type { OperatorInstanceRow } from '$lib/operator/instances-client.js';
	import { onMount } from 'svelte';
	import {
		arrearsLabel,
		DEFAULT_PAGE_LIMIT,
		enforcementPosture,
		loadStoredOpsToken,
		mergePage,
		registrationBlockText,
		reservedAtText,
		saveStoredOpsToken
	} from './instances-state.js';

	let opsToken = $state('');
	let rows = $state<OperatorInstanceRow[]>([]);
	let cursor = $state<string | undefined>(undefined);
	let loaded = $state(false);
	let loading = $state(false);
	let error = $state('');
	let notConfigured = $state(false);
	/** r-uuid → kill-switch enabled, from the lazy per-row read. */
	let enabledByR = $state<Record<string, boolean>>({});
	let enabledLoading = $state<Record<string, boolean>>({});

	onMount(() => {
		opsToken = loadStoredOpsToken();
	});

	async function callOperatorBff(path: string): Promise<Response> {
		return fetch(path, { headers: { Authorization: `Bearer ${opsToken.trim()}` } });
	}

	async function problemDetail(res: Response): Promise<string> {
		try {
			const body = (await res.json()) as { detail?: string; title?: string };
			return body.detail ?? body.title ?? `request failed (${res.status})`;
		} catch {
			return `request failed (${res.status})`;
		}
	}

	async function loadPage(reset: boolean) {
		if (!opsToken.trim()) {
			error = 'Enter the operator token for this deployment.';
			return;
		}
		loading = true;
		error = '';
		notConfigured = false;
		saveStoredOpsToken(opsToken);
		try {
			const query =
				`limit=${DEFAULT_PAGE_LIMIT}` +
				(!reset && cursor ? `&cursor=${encodeURIComponent(cursor)}` : '');
			const res = await callOperatorBff(`/api/operator/instances?${query}`);
			if (res.status === 501) {
				notConfigured = true;
				return;
			}
			if (!res.ok) {
				error = await problemDetail(res);
				return;
			}
			const page = (await res.json()) as { instances: OperatorInstanceRow[]; cursor?: string };
			rows = reset ? page.instances : mergePage(rows, page.instances);
			cursor = page.cursor;
			loaded = true;
			if (reset) enabledByR = {};
		} catch (err) {
			error = err instanceof Error ? err.message : 'Instance listing failed';
		} finally {
			loading = false;
		}
	}

	async function loadKillSwitch(row: OperatorInstanceRow) {
		const r = row.r;
		if (!r || enabledLoading[r]) return;
		enabledLoading = { ...enabledLoading, [r]: true };
		try {
			const res = await callOperatorBff(`/api/operator/instances/${encodeURIComponent(r)}/enabled`);
			if (!res.ok) {
				error = await problemDetail(res);
				return;
			}
			const body = (await res.json()) as { enabled: boolean };
			enabledByR = { ...enabledByR, [r]: body.enabled };
		} catch (err) {
			error = err instanceof Error ? err.message : 'Kill-switch read failed';
		} finally {
			enabledLoading = { ...enabledLoading, [r]: false };
		}
	}
</script>

<main class="mx-auto max-w-6xl space-y-6 px-6 py-8">
	<div>
		<h1 class="text-xl font-semibold">Instances</h1>
		<p class="mt-1 text-sm text-zinc-600">
			Operator view of every reserved and registered univocity instance: reservation state, billing
			posture (credits, accrued checkpoints, arrears, watermark) and the sealing kill-switch.
			Requires this deployment's operator token — the forestrie-operator personality.
		</p>
	</div>

	{#if error}
		<Alert variant="destructive" title="Something went wrong">{error}</Alert>
	{/if}
	{#if notConfigured}
		<Alert title="Operator personality disabled">
			This mandate deployment has no operator configuration (MANDATE_OPS_UI_TOKEN /
			CANOPY_UPSTREAM_URL / MANDATE_CANOPY_OPS_TOKEN). Instance enumeration is unavailable.
		</Alert>
	{/if}

	<Card class="space-y-4 p-6">
		<h2 class="font-medium">Operator token</h2>
		<p class="text-sm text-zinc-600">
			Held in this browser session only; the canopy operator credential never leaves the server.
		</p>
		<div class="flex gap-2">
			<Input type="password" placeholder="operator token" bind:value={opsToken} class="max-w-md" />
			<Button onclick={() => loadPage(true)} disabled={loading}>
				{loading && !loaded ? 'Loading…' : 'Load instances'}
			</Button>
		</div>
	</Card>

	{#if loaded}
		<Card class="space-y-4 p-6">
			<div class="flex items-center justify-between">
				<h2 class="font-medium">
					{rows.length} instance{rows.length === 1 ? '' : 's'}{cursor ? ' (more available)' : ''}
				</h2>
				<Button variant="outline" onclick={() => loadPage(true)} disabled={loading}>Reload</Button>
			</div>

			{#if rows.length === 0}
				<p class="text-sm text-zinc-600">No reservations or registrations yet.</p>
			{:else}
				<div class="overflow-x-auto">
					<table class="w-full text-left text-sm">
						<thead>
							<tr class="border-b text-xs text-zinc-500 uppercase">
								<th class="py-2 pr-4">Instance</th>
								<th class="py-2 pr-4">State</th>
								<th class="py-2 pr-4">Reserved</th>
								<th class="py-2 pr-4">Reg. block</th>
								<th class="py-2 pr-4">Credits</th>
								<th class="py-2 pr-4">Accrued</th>
								<th class="py-2 pr-4">Watermark</th>
								<th class="py-2 pr-4">Enforcement</th>
							</tr>
						</thead>
						<tbody>
							{#each rows as row (row.univocityInstanceId)}
								{@const posture = enforcementPosture(
									row.receivables?.enforcementFrozen,
									row.r ? enabledByR[row.r] : undefined
								)}
								<tr class="border-b align-top">
									<td class="py-2 pr-4 font-mono text-xs">
										{row.univocityInstanceId}
										{#if row.r}
											<div class="text-zinc-500">r={row.r}</div>
										{/if}
									</td>
									<td class="py-2 pr-4">
										<Badge variant={row.state === 'registered' ? 'default' : 'secondary'}>
											{row.state}
										</Badge>
										<div class="mt-1 font-mono text-xs text-zinc-500">{row.holder}</div>
									</td>
									<td class="py-2 pr-4 whitespace-nowrap">{reservedAtText(row)}</td>
									<td class="py-2 pr-4">{registrationBlockText(row)}</td>
									{#if row.state === 'registered'}
										{#if row.receivables}
											<td class="py-2 pr-4">{row.receivables.creditsBalance}</td>
											<td class="py-2 pr-4">
												{row.receivables.checkpointsAccrued}
												{#if arrearsLabel(row.receivables.arrears)}
													<div class="text-xs text-amber-700">
														{arrearsLabel(row.receivables.arrears)}
													</div>
												{/if}
											</td>
											<td class="py-2 pr-4">{row.receivables.watermarkBlock ?? '—'}</td>
										{:else}
											<td class="py-2 pr-4 text-zinc-500" colspan="3">
												receivables unavailable{row.receivablesDetail
													? `: ${row.receivablesDetail}`
													: ''}
											</td>
										{/if}
										<td class="py-2 pr-4">
											<Badge variant={posture.variant}>{posture.label}</Badge>
											{#if row.r && enabledByR[row.r] === undefined}
												<div class="mt-1">
													<Button
														variant="outline"
														onclick={() => loadKillSwitch(row)}
														disabled={enabledLoading[row.r] === true}
													>
														{enabledLoading[row.r] ? 'Loading…' : 'Load kill-switch'}
													</Button>
												</div>
											{/if}
										</td>
									{:else}
										<td class="py-2 pr-4 text-zinc-400" colspan="4">reserved — nothing to bill</td>
									{/if}
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}

			{#if cursor}
				<Button variant="outline" onclick={() => loadPage(false)} disabled={loading}>
					{loading ? 'Loading…' : 'Load more'}
				</Button>
			{/if}
		</Card>
	{/if}
</main>
