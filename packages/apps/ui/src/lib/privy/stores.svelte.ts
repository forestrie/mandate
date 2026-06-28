import { browser } from '$app/environment';
import {
	ensureWalletChain,
	getConfiguredDefaultChainId,
	readWalletChainId
} from '$lib/chains/wallet-chain.js';
import { SUPPORTED_CHAINS } from '$lib/chains/supported-chains.js';
import {
	getConnectedEthereumProvider,
	getConnectedWalletAddress,
	getPrivyClient
} from './client.js';

export interface PrivySessionState {
	ready: boolean;
	authenticated: boolean;
	address: string | null;
	chainId: number | null;
	selectedChainId: number;
	error: string | null;
}

const defaultChainId = getConfiguredDefaultChainId();

let state = $state<PrivySessionState>({
	ready: false,
	authenticated: false,
	address: null,
	chainId: null,
	selectedChainId: defaultChainId,
	error: null
});

let initialized = false;

export function getSupportedMandateChains(): typeof SUPPORTED_CHAINS {
	return SUPPORTED_CHAINS;
}

export function getPrivySessionState(): PrivySessionState {
	return state;
}

export async function setSelectedChainId(chainId: number): Promise<void> {
	state = { ...state, selectedChainId: chainId, error: null };
	if (state.authenticated) {
		await applySelectedChain();
	}
}

async function alignWalletToSelectedChain(): Promise<void> {
	const provider = await getConnectedEthereumProvider();
	if (!provider) {
		state = {
			...state,
			chainId: null
		};
		return;
	}
	await ensureWalletChain(provider, state.selectedChainId);
	const chainId = await readWalletChainId(provider);
	state = {
		...state,
		chainId
	};
}

export async function initPrivySession(): Promise<void> {
	if (!browser || initialized) return;
	initialized = true;
	try {
		await refreshPrivySession();
	} catch (error) {
		state = {
			ready: true,
			authenticated: false,
			address: null,
			chainId: null,
			selectedChainId: defaultChainId,
			error: error instanceof Error ? error.message : 'Privy init failed'
		};
	}
}

export async function refreshPrivySession(): Promise<void> {
	const address = await getConnectedWalletAddress();
	if (!address) {
		state = {
			ready: true,
			authenticated: false,
			address: null,
			chainId: null,
			selectedChainId: state.selectedChainId,
			error: null
		};
		return;
	}

	state = {
		ready: true,
		authenticated: true,
		address,
		chainId: null,
		selectedChainId: state.selectedChainId,
		error: null
	};

	try {
		await alignWalletToSelectedChain();
	} catch (error) {
		state = {
			...state,
			error: error instanceof Error ? error.message : 'Wallet chain alignment failed'
		};
	}
}

/** Request an email OTP via Privy (step 1 of login). */
export async function sendEmailLoginCode(email: string): Promise<void> {
	const privy = await getPrivyClient();
	await privy.auth.email.sendCode(email);
}

/** Complete email OTP login (step 2). */
export async function completeEmailLogin(email: string, code: string): Promise<void> {
	const privy = await getPrivyClient();
	await privy.auth.email.loginWithCode(email, code.trim(), 'login-or-sign-up', {
		embedded: { ethereum: { createOnLogin: 'users-without-wallets' } }
	});
	await refreshPrivySession();
}

export async function applySelectedChain(): Promise<void> {
	if (!state.authenticated) {
		return;
	}
	state = { ...state, error: null };
	try {
		await alignWalletToSelectedChain();
	} catch (error) {
		state = {
			...state,
			error: error instanceof Error ? error.message : 'Wallet chain alignment failed'
		};
	}
}

export async function logoutPrivy(): Promise<void> {
	const privy = await getPrivyClient();
	await privy.auth.logout();
	await refreshPrivySession();
}
