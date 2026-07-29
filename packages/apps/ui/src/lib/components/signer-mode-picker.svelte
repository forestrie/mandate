<script lang="ts">
	import { cn } from '$lib/utils.js';
	import type { SignerBackendKind } from '$lib/signing/resolve-backend.js';

	let {
		mode,
		options,
		onSelect
	}: {
		mode: SignerBackendKind;
		options: SignerBackendKind[];
		onSelect: (kind: SignerBackendKind) => void;
	} = $props();

	const labels: Record<SignerBackendKind, string> = {
		privy: 'Privy',
		safe: 'External wallet + Safe',
		burner: 'Burner (demo)'
	};
</script>

<div
	class="inline-flex rounded-md border border-zinc-200 bg-zinc-50 p-0.5"
	role="radiogroup"
	aria-label="Signing backend"
>
	{#each options as kind (kind)}
		<button
			type="button"
			role="radio"
			aria-checked={mode === kind}
			class={cn(
				'rounded px-3 py-1.5 text-xs font-medium transition',
				mode === kind ? 'bg-white text-zinc-950 shadow-sm' : 'text-zinc-500 hover:text-zinc-800'
			)}
			onclick={() => onSelect(kind)}
		>
			{labels[kind]}
		</button>
	{/each}
</div>
