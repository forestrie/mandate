<script lang="ts">
	import { cn } from '$lib/utils.js';
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';

	type Variant = 'default' | 'secondary' | 'outline' | 'destructive';

	let {
		class: className,
		variant = 'default',
		children,
		...rest
	}: HTMLButtonAttributes & {
		variant?: Variant;
		children?: Snippet;
	} = $props();

	const variants: Record<Variant, string> = {
		default: 'bg-emerald-700 text-white hover:bg-emerald-800',
		secondary: 'bg-zinc-100 text-zinc-900 hover:bg-zinc-200',
		outline: 'border border-zinc-300 bg-white hover:bg-zinc-50',
		destructive: 'bg-red-600 text-white hover:bg-red-700'
	};
</script>

<button
	class={cn(
		'inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition disabled:opacity-50',
		variants[variant],
		className
	)}
	{...rest}
>
	{@render children?.()}
</button>
