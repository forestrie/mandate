import type { EthereumProvider } from '$lib/privy/client.js';
import { getSessionSignerBackend } from '$lib/signing/resolve-backend.js';

/**
 * Mode-aware wallet resolution (plan-2607-45 slice 03): the surfaces that need
 * "the provider/address behind this session" — the x402 payer, the
 * control-plane challenge — must follow the session's signing mode. In Mode D
 * that is the INJECTED owner wallet (the payer is the owner EOA, decision Q9);
 * Privy mode keeps the embedded wallet; burner mode has no provider at all.
 *
 * Both branches import dynamically so neither wallet stack lands in the other
 * mode's chunk.
 */

export async function getActiveEthereumProvider(): Promise<EthereumProvider | null> {
	switch (getSessionSignerBackend()) {
		case 'safe': {
			const { getInjectedProvider } = await import('./stores.svelte.js');
			return getInjectedProvider();
		}
		case 'burner':
			return null;
		default: {
			const { getConnectedEthereumProvider } = await import('$lib/privy/client.js');
			return getConnectedEthereumProvider();
		}
	}
}

export async function getActiveWalletAddress(): Promise<string | null> {
	switch (getSessionSignerBackend()) {
		case 'safe': {
			const { getInjectedWalletState } = await import('./stores.svelte.js');
			return getInjectedWalletState().address;
		}
		case 'burner': {
			const { getBurnerAddress } = await import('$lib/signing/local-burner-key.js');
			return getBurnerAddress();
		}
		default: {
			const { getConnectedWalletAddress } = await import('$lib/privy/client.js');
			return getConnectedWalletAddress();
		}
	}
}
