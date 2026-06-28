import { baseSepolia } from 'viem/chains';

/** Chain metadata for Mandate UI wallet alignment (matches deploy-web). */
export type SupportedChain = {
	chainId: number;
	name: string;
	addChainParams: {
		chainId: string;
		chainName: string;
		nativeCurrency: {
			name: string;
			symbol: string;
			decimals: number;
		};
		rpcUrls: string[];
		blockExplorerUrls?: string[];
	};
};

/** EVM chains Mandate supports for Forestrie dev onboarding. */
export const SUPPORTED_CHAINS: readonly SupportedChain[] = [
	(() => {
		const blockExplorerUrl = baseSepolia.blockExplorers?.default?.url;
		return {
			chainId: baseSepolia.id,
			name: 'Base Sepolia',
			addChainParams: {
				chainId: `0x${baseSepolia.id.toString(16)}`,
				chainName: baseSepolia.name,
				nativeCurrency: baseSepolia.nativeCurrency,
				rpcUrls: [...baseSepolia.rpcUrls.default.http],
				...(blockExplorerUrl ? { blockExplorerUrls: [blockExplorerUrl] } : {})
			}
		};
	})()
];

/** Lookup supported chain by EIP-155 id. */
export function getSupportedChain(chainId: number): SupportedChain | undefined {
	return SUPPORTED_CHAINS.find((chain) => chain.chainId === chainId);
}

/** Default Mandate UI chain when env is unset or invalid. */
export function getDefaultSupportedChain(): SupportedChain {
	return SUPPORTED_CHAINS[0]!;
}
