<script lang="ts">
	import { resolve } from '$app/paths';
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Mandate</title>
</svelte:head>

<div class="min-h-screen bg-zinc-50 text-zinc-950">
	<header class="border-b border-zinc-200 bg-white">
		<div class="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
			<a href={resolve('/')} class="text-sm font-semibold tracking-wide text-emerald-800">Mandate</a
			>
			<nav class="flex gap-4 text-sm text-zinc-600">
				<a href={resolve('/onboard')} class="hover:text-zinc-950">Onboard</a>
				<a href={resolve('/delegations')} class="hover:text-zinc-950">Delegations</a>
				<a href={resolve('/fees')} class="hover:text-zinc-950">Fees</a>
				<a href={resolve('/instances')} class="hover:text-zinc-950">Instances</a>
			</nav>
		</div>
	</header>
	{@render children()}
</div>
