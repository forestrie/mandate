import { browser } from '$app/environment';
import {
	ensureWalletChain,
	getConfiguredDefaultChainId,
	readWalletChainId
} from '$lib/chains/wallet-chain.js';
import type { EthereumProvider } from '$lib/privy/client.js';
import { clearAccountReadAuthorizations } from '$lib/payments/account-read-auth.js';
import { SigningBackendUnavailableError } from '$lib/signing/signing-backend.js';
import type { SafeSigningContext } from '$lib/signing/safe-backend.js';
import {
	discoverInjectedProviders,
	type Eip6963ProviderDetail,
	type EventedEthereumProvider
} from './eip6963.js';
import { defaultSafeReadTransport, validateSafeAccount } from './safe-validation.js';

/**
 * Injected-wallet session for Safe 1x1 (Mode D) — the Privy-free owner
 * connect seam (plan-2607-45 slice 03, FOR-502). Holds the discovered
 * EIP-6963 providers, the connected owner account, and the validated Safe
 * root this session signs for.
 */

export interface SafeValidationState {
	status: 'valid' | 'invalid' | 'unavailable';
	detail: string | null;
}

export interface InjectedWalletState {
	ready: boolean;
	connecting: boolean;
	providers: Eip6963ProviderDetail[];
	/** Connected owner account (EOA of the injected wallet). */
	address: string | null;
	chainId: number | null;
	providerName: string | null;
	/** Safe address the operator entered (persisted for the session). */
	safeAddress: string;
	/** Result of the last validation of `safeAddress` for `address`. */
	safeValidation: SafeValidationState | null;
	error: string | null;
}

const SAFE_ADDRESS_KEY = 'mandate.session.safeAddress';

function storedSafeAddress(): string {
	if (typeof sessionStorage === 'undefined') return '';
	return sessionStorage.getItem(SAFE_ADDRESS_KEY) ?? '';
}

let state = $state<InjectedWalletState>({
	ready: false,
	connecting: false,
	providers: [],
	address: null,
	chainId: null,
	providerName: null,
	safeAddress: '',
	safeValidation: null,
	error: null
});

/** The live EIP-1193 provider is not serialisable UI state — module-held. */
let activeProvider: EventedEthereumProvider | null = null;
let boundProvider: EventedEthereumProvider | null = null;
let boundHandlers: {
	accountsChanged: (...args: unknown[]) => void;
	chainChanged: (...args: unknown[]) => void;
} | null = null;

export function getInjectedWalletState(): InjectedWalletState {
	return state;
}

export function getInjectedProvider(): EthereumProvider | null {
	return activeProvider;
}

/** Discover EIP-6963 providers (idempotent; refreshes the list each call). */
export async function initInjectedWallets(): Promise<void> {
	if (!browser) return;
	const providers = await discoverInjectedProviders();
	state = {
		...state,
		ready: true,
		providers,
		safeAddress: state.safeAddress || storedSafeAddress()
	};
}

/**
 * Listener lifecycle (plan-2607-04 R3): exactly one bound provider at a time.
 * Handlers are detached on disconnect/rebind, and each handler ignores events
 * from a provider that is no longer active — a disconnected wallet must never
 * mutate the live session.
 */
function unbindProviderListeners(): void {
	if (boundProvider?.removeListener && boundHandlers) {
		boundProvider.removeListener('accountsChanged', boundHandlers.accountsChanged);
		boundProvider.removeListener('chainChanged', boundHandlers.chainChanged);
	}
	boundProvider = null;
	boundHandlers = null;
}

function bindProviderListeners(provider: EventedEthereumProvider): void {
	unbindProviderListeners();
	if (!provider.on) return;
	const accountsChanged = (...args: unknown[]) => {
		if (provider !== activeProvider) return;
		const accounts = (args[0] as string[] | undefined) ?? [];
		// A minted read credential belongs to the wallet that signed it, and a
		// Safe validation belongs to the owner that was checked — both die with
		// the account (plan-2607-02 R4).
		clearAccountReadAuthorizations();
		state = {
			...state,
			address: accounts[0] ?? null,
			safeValidation: null,
			error: null
		};
	};
	const chainChanged = (...args: unknown[]) => {
		if (provider !== activeProvider) return;
		const raw = args[0];
		const chainId =
			typeof raw === 'string' ? Number.parseInt(raw, 16) : typeof raw === 'number' ? raw : null;
		state = { ...state, chainId };
	};
	provider.on('accountsChanged', accountsChanged);
	provider.on('chainChanged', chainChanged);
	boundProvider = provider;
	boundHandlers = { accountsChanged, chainChanged };
}

/**
 * Connect an injected wallet (by rdns, or the only discovered one) and align
 * it to the configured Mandate chain.
 */
export async function connectInjectedWallet(rdns?: string): Promise<void> {
	if (!browser) return;
	state = { ...state, connecting: true, error: null };
	try {
		if (state.providers.length === 0) await initInjectedWallets();
		const detail = rdns ? state.providers.find((p) => p.info.rdns === rdns) : state.providers[0];
		if (!detail) {
			throw new Error('No injected wallet found — install a browser wallet to use Mode D');
		}
		const provider = detail.provider as EventedEthereumProvider;
		const accounts = (await provider.request({ method: 'eth_requestAccounts' })) as string[];
		const address = accounts?.[0];
		if (!address) {
			throw new Error('Wallet returned no account');
		}
		const targetChainId = getConfiguredDefaultChainId();
		await ensureWalletChain(provider, targetChainId);
		const chainId = await readWalletChainId(provider);
		activeProvider = provider;
		bindProviderListeners(provider);
		clearAccountReadAuthorizations();
		state = {
			...state,
			connecting: false,
			address,
			chainId,
			providerName: detail.info.name,
			safeValidation: null
		};
		if (state.safeAddress) {
			await validateSessionSafe();
		}
	} catch (error) {
		state = {
			...state,
			connecting: false,
			error: error instanceof Error ? error.message : 'Wallet connect failed'
		};
	}
}

export function disconnectInjectedWallet(): void {
	activeProvider = null;
	unbindProviderListeners();
	clearAccountReadAuthorizations();
	state = {
		...state,
		address: null,
		chainId: null,
		providerName: null,
		safeValidation: null,
		error: null
	};
}

/** Record the Safe address the operator entered; invalidates any validation. */
export function setSessionSafeAddress(address: string): void {
	const trimmed = address.trim();
	if (typeof sessionStorage !== 'undefined') {
		if (trimmed) sessionStorage.setItem(SAFE_ADDRESS_KEY, trimmed);
		else sessionStorage.removeItem(SAFE_ADDRESS_KEY);
	}
	state = { ...state, safeAddress: trimmed, safeValidation: null };
}

/**
 * Validate the session's Safe address against the connected owner (code +
 * owners + threshold==1). An unreachable chain reports `unavailable`, not
 * `invalid` — "could not ask" is not "the contract said no".
 */
export async function validateSessionSafe(): Promise<void> {
	const provider = activeProvider;
	const owner = state.address;
	if (!provider || !owner) {
		state = {
			...state,
			safeValidation: { status: 'invalid', detail: 'Connect a wallet before validating the Safe' }
		};
		return;
	}
	try {
		const transport = defaultSafeReadTransport(provider);
		// The validation endpoint must serve the console's configured chain
		// (plan-2607-04 low: PUBLIC_RPC_URL vs PUBLIC_DEFAULT_CHAIN_ID drift is a
		// deployment misconfiguration, not a verdict on the Safe).
		const expectedChainId = getConfiguredDefaultChainId();
		const rpcChainId = await transport.chainId();
		if (rpcChainId !== expectedChainId) {
			state = {
				...state,
				safeValidation: {
					status: 'unavailable',
					detail: `Validation RPC serves chain ${rpcChainId} but the console is configured for ${expectedChainId} — deployment misconfiguration`
				}
			};
			return;
		}
		const result = await validateSafeAccount(transport, state.safeAddress, owner);
		state = {
			...state,
			safeValidation: result.ok
				? { status: 'valid', detail: null }
				: { status: 'invalid', detail: result.reason }
		};
	} catch (error) {
		state = {
			...state,
			safeValidation: {
				status: 'unavailable',
				detail: error instanceof Error ? error.message : 'Safe validation failed'
			}
		};
	}
}

/** Everything the SafeBackend needs to sign; throws until the session is ready. */
export function getSafeSigningContext(): SafeSigningContext {
	if (!activeProvider || !state.address) {
		throw new SigningBackendUnavailableError('Connect the Safe owner wallet before signing.');
	}
	if (!state.safeAddress || state.safeValidation?.status !== 'valid') {
		throw new SigningBackendUnavailableError('Validate the Safe address before signing.');
	}
	return {
		provider: activeProvider,
		ownerAddress: state.address,
		safeAddress: state.safeAddress,
		chainId: getConfiguredDefaultChainId()
	};
}
