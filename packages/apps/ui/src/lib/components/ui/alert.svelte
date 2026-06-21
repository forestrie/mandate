<script lang="ts">
	import { cn } from '$lib/utils.js';
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';

	type Variant = 'default' | 'destructive';

	let {
		class: className,
		variant = 'default',
		title,
		children,
		...rest
	}: HTMLAttributes<HTMLDivElement> & {
		variant?: Variant;
		title?: string;
		children?: Snippet;
	} = $props();

	const variants: Record<Variant, string> = {
		default: 'border-zinc-200 bg-zinc-50 text-zinc-900',
		destructive: 'border-red-200 bg-red-50 text-red-900'
	};
</script>

<div
	role="alert"
	class={cn('rounded-lg border px-4 py-3 text-sm', variants[variant], className)}
	{...rest}
>
	{#if title}
		<p class="mb-1 font-medium">{title}</p>
	{/if}
	{@render children?.()}
</div>
