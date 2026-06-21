<script lang="ts">
	import { cn } from '$lib/utils.js';
	import type { HTMLInputAttributes } from 'svelte/elements';

	let { class: className, value = $bindable(''), ...rest }: HTMLInputAttributes = $props();
</script>

<input
	class={cn(
		'flex h-10 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:outline-none',
		className
	)}
	bind:value
	{...rest}
/>
