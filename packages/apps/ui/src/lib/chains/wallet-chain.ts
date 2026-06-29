import { PUBLIC_DEFAULT_CHAIN_ID } from '$env/static/public';
import type { EthereumProvider } from '$lib/privy/client.js';
import {
	getDefaultSupportedChain,
	getSupportedChain,
	type SupportedChain
} from './supported-chains.js';

/** Parse build-time default chain id (falls back to Base Sepolia). */
export function getConfiguredDefaultChainId(): number {
	const raw = PUBLIC_DEFAULT_CHAIN_ID?.trim();
	if (raw) {
		const parsed = Number.parseInt(raw, 10);
		const chain = getSupportedChain(parsed);
		if (chain) {
			return chain.chainId;
		}
	}
	return getDefaultSupportedChain().chainId;
}

/** Read `eth_chainId` from an EIP-1193 provider. */
export async function readWalletChainId(provider: EthereumProvider): Promise<number> {
	const raw = await provider.request({ method: 'eth_chainId' });
	if (typeof raw === 'string') {
		return Number.parseInt(raw, 16);
	}
	if (typeof raw === 'number') {
		return raw;
	}
	throw new Error('wallet did not return eth_chainId');
}

function chainIdToHex(chainId: number): string {
	return `0x${chainId.toString(16)}`;
}

function isChainNotAddedError(error: unknown): boolean {
	if (typeof error === 'object' && error !== null && 'code' in error) {
		return (error as { code: number }).code === 4902;
	}
	const message = error instanceof Error ? error.message : String(error);
	return message.includes('4902') || message.toLowerCase().includes('unrecognized chain');
}

async function addWalletChain(provider: EthereumProvider, chain: SupportedChain): Promise<void> {
	await provider.request({
		method: 'wallet_addEthereumChain',
		params: [chain.addChainParams]
	});
}

async function switchWalletChain(provider: EthereumProvider, chainId: number): Promise<void> {
	await provider.request({
		method: 'wallet_switchEthereumChain',
		params: [{ chainId: chainIdToHex(chainId) }]
	});
}

/** Align embedded or injected wallet to a supported Mandate chain. */
export async function ensureWalletChain(
	provider: EthereumProvider,
	chainId: number
): Promise<void> {
	const chain = getSupportedChain(chainId);
	if (!chain) {
		throw new Error(`chain ${chainId} is not supported by Mandate`);
	}

	const current = await readWalletChainId(provider);
	if (current === chainId) {
		return;
	}

	try {
		await switchWalletChain(provider, chainId);
	} catch (error) {
		if (!isChainNotAddedError(error)) {
			throw error;
		}
		await addWalletChain(provider, chain);
		await switchWalletChain(provider, chainId);
	}

	const after = await readWalletChainId(provider);
	if (after !== chainId) {
		throw new Error(`wallet chainId ${after} does not match configured ${chainId}`);
	}
}
