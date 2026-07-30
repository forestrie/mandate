import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Eip6963ProviderDetail, EventedEthereumProvider } from './eip6963.js';

/**
 * Injected-wallet store lifecycle (plan-2607-04 R3): one bound provider at a
 * time; a disconnected or replaced wallet's events must be inert.
 */

vi.mock('$app/environment', () => ({ browser: true }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));
vi.mock('$lib/chains/wallet-chain.js', () => ({
	getConfiguredDefaultChainId: () => 84532,
	ensureWalletChain: async () => {},
	readWalletChainId: async () => 84532
}));
const clearAccountReadAuthorizations = vi.fn();
vi.mock('$lib/payments/account-read-auth.js', () => ({
	clearAccountReadAuthorizations: () => clearAccountReadAuthorizations()
}));

const discovered: Eip6963ProviderDetail[] = [];
vi.mock('./eip6963.js', async (importOriginal) => ({
	...(await importOriginal<typeof import('./eip6963.js')>()),
	discoverInjectedProviders: async () => discovered
}));

interface FakeProvider extends EventedEthereumProvider {
	emit(event: string, ...args: unknown[]): void;
	listenerCount(event: string): number;
}

function fakeEventedProvider(address: string): FakeProvider {
	const listeners = new Map<string, Array<(...args: unknown[]) => void>>();
	return {
		async request({ method }: { method: string; params?: unknown[] }) {
			if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [address];
			if (method === 'eth_chainId') return '0x14a34';
			return null;
		},
		on(event, listener) {
			listeners.set(event, [...(listeners.get(event) ?? []), listener]);
		},
		removeListener(event, listener) {
			listeners.set(
				event,
				(listeners.get(event) ?? []).filter((l) => l !== listener)
			);
		},
		emit(event, ...args) {
			for (const listener of listeners.get(event) ?? []) listener(...args);
		},
		listenerCount(event) {
			return (listeners.get(event) ?? []).length;
		}
	};
}

function detailFor(rdns: string, provider: FakeProvider): Eip6963ProviderDetail {
	return { info: { uuid: rdns, name: rdns, icon: '', rdns }, provider };
}

class MemoryStorage {
	private map = new Map<string, string>();
	getItem(key: string) {
		return this.map.has(key) ? this.map.get(key)! : null;
	}
	setItem(key: string, value: string) {
		this.map.set(key, value);
	}
	removeItem(key: string) {
		this.map.delete(key);
	}
}

beforeEach(() => {
	vi.stubGlobal('sessionStorage', new MemoryStorage());
	discovered.length = 0;
	clearAccountReadAuthorizations.mockClear();
	vi.resetModules();
});

describe('injected wallet store listener lifecycle', () => {
	it('reconnecting does not stack duplicate handlers', async () => {
		const store = await import('./stores.svelte.js');
		const provider = fakeEventedProvider('0xaaa0000000000000000000000000000000000001');
		discovered.push(detailFor('dev.one', provider));

		await store.connectInjectedWallet('dev.one');
		await store.connectInjectedWallet('dev.one');
		expect(provider.listenerCount('accountsChanged')).toBe(1);
		expect(provider.listenerCount('chainChanged')).toBe(1);

		provider.emit('accountsChanged', ['0xaaa0000000000000000000000000000000000002']);
		expect(store.getInjectedWalletState().address).toBe(
			'0xaaa0000000000000000000000000000000000002'
		);
	});

	it('a disconnected provider is detached and its events are inert', async () => {
		const store = await import('./stores.svelte.js');
		const provider = fakeEventedProvider('0xaaa0000000000000000000000000000000000001');
		discovered.push(detailFor('dev.one', provider));

		await store.connectInjectedWallet('dev.one');
		store.disconnectInjectedWallet();
		expect(provider.listenerCount('accountsChanged')).toBe(0);

		provider.emit('accountsChanged', ['0xdead000000000000000000000000000000000000']);
		expect(store.getInjectedWalletState().address).toBeNull();
	});

	it('after switching wallets, the replaced provider cannot mutate the session', async () => {
		const store = await import('./stores.svelte.js');
		const first = fakeEventedProvider('0xaaa0000000000000000000000000000000000001');
		const second = fakeEventedProvider('0xbbb0000000000000000000000000000000000001');
		discovered.push(detailFor('dev.one', first), detailFor('dev.two', second));

		await store.connectInjectedWallet('dev.one');
		await store.connectInjectedWallet('dev.two');
		expect(store.getInjectedWalletState().address).toBe(
			'0xbbb0000000000000000000000000000000000001'
		);
		expect(first.listenerCount('accountsChanged')).toBe(0);

		// Even a listener that somehow survived would be guarded out.
		first.emit('accountsChanged', ['0xdead000000000000000000000000000000000000']);
		expect(store.getInjectedWalletState().address).toBe(
			'0xbbb0000000000000000000000000000000000001'
		);
	});

	it('accountsChanged drops the minted read-credential cache (plan-2607-02 R4)', async () => {
		const store = await import('./stores.svelte.js');
		const provider = fakeEventedProvider('0xaaa0000000000000000000000000000000000001');
		discovered.push(detailFor('dev.one', provider));

		await store.connectInjectedWallet('dev.one');
		clearAccountReadAuthorizations.mockClear();
		provider.emit('accountsChanged', ['0xaaa0000000000000000000000000000000000002']);
		expect(clearAccountReadAuthorizations).toHaveBeenCalledTimes(1);
		expect(store.getInjectedWalletState().safeValidation).toBeNull();
	});
});
