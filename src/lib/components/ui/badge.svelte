<script lang="ts">
	import { cn } from '$lib/utils.js';
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';

	type Variant = 'default' | 'secondary' | 'outline';

	let {
		class: className,
		variant = 'default',
		children,
		...rest
	}: HTMLAttributes<HTMLSpanElement> & { variant?: Variant; children?: Snippet } = $props();

	const variants: Record<Variant, string> = {
		default: 'bg-emerald-100 text-emerald-900',
		secondary: 'bg-zinc-100 text-zinc-700',
		outline: 'border border-zinc-300 text-zinc-700'
	};
</script>

<span
	class={cn(
		'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
		variants[variant],
		className
	)}
	{...rest}
>
	{@render children?.()}
</span>
