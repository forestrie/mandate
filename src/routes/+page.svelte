<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Button from '$lib/components/ui/button.svelte';
	import Card from '$lib/components/ui/card.svelte';
	import Input from '$lib/components/ui/input.svelte';

	let authLogId = $state('');

	function openConsole() {
		if (!authLogId.trim()) return;
		const base = resolve('/delegations');
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- query string appended after resolved base path
		void goto(`${base}?authLogId=${encodeURIComponent(authLogId.trim())}`);
	}
</script>

<main class="mx-auto flex min-h-[70vh] max-w-3xl flex-col justify-center gap-8 p-6">
	<div class="space-y-3">
		<p class="text-sm font-medium tracking-wide text-emerald-700 uppercase">Sylvestris</p>
		<h1 class="text-4xl font-semibold tracking-tight text-zinc-950">Delegation wallet console</h1>
		<p class="max-w-2xl text-base leading-relaxed text-zinc-600">
			BYOK operators use Sylvestris to review pending delegation leases and submit signed material
			to the Forestrie delegation coordinator — without running Canopy.
		</p>
	</div>

	<Card class="space-y-4 p-6">
		<h2 class="text-lg font-medium">Get started</h2>
		<p class="text-sm text-zinc-600">Enter your authority log ID to open the delegation console.</p>
		<div class="flex flex-col gap-3 sm:flex-row">
			<Input bind:value={authLogId} placeholder="Auth log UUID or 32-char hex" class="flex-1" />
			<Button onclick={openConsole} disabled={!authLogId.trim()}>Open console</Button>
		</div>
	</Card>
</main>
