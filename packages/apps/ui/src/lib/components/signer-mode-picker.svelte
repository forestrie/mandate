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

	let buttons: HTMLButtonElement[] = [];

	// Standard radiogroup keyboard semantics: arrows move AND select (roving
	// tabindex — only the checked option is tabbable), Home/End jump.
	function onKeydown(event: KeyboardEvent, index: number) {
		let next: number;
		switch (event.key) {
			case 'ArrowRight':
			case 'ArrowDown':
				next = (index + 1) % options.length;
				break;
			case 'ArrowLeft':
			case 'ArrowUp':
				next = (index - 1 + options.length) % options.length;
				break;
			case 'Home':
				next = 0;
				break;
			case 'End':
				next = options.length - 1;
				break;
			default:
				return;
		}
		event.preventDefault();
		onSelect(options[next]!);
		buttons[next]?.focus();
	}
</script>

<div
	class="inline-flex rounded-md border border-zinc-200 bg-zinc-50 p-0.5"
	role="radiogroup"
	aria-label="Signing backend"
>
	{#each options as kind, index (kind)}
		<button
			bind:this={buttons[index]}
			type="button"
			role="radio"
			aria-checked={mode === kind}
			tabindex={mode === kind ? 0 : -1}
			class={cn(
				'rounded px-3 py-1.5 text-xs font-medium transition',
				mode === kind ? 'bg-white text-zinc-950 shadow-sm' : 'text-zinc-500 hover:text-zinc-800'
			)}
			onclick={() => onSelect(kind)}
			onkeydown={(event) => onKeydown(event, index)}
		>
			{labels[kind]}
		</button>
	{/each}
</div>
