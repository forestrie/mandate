import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EthereumProvider } from '$lib/privy/client.js';
import { LEGACY_INJECTED_RDNS, discoverInjectedProviders } from './eip6963.js';

function makeWindow(): EventTarget & { ethereum?: EthereumProvider } {
	// Node 22 EventTarget/CustomEvent are enough of a `window` for discovery.
	return new EventTarget() as EventTarget & { ethereum?: EthereumProvider };
}

function fakeProvider(): EthereumProvider {
	return { request: async () => null };
}

function announceOnRequest(target: EventTarget, rdns: string, provider: EthereumProvider): void {
	target.addEventListener('eip6963:requestProvider', () => {
		target.dispatchEvent(
			new CustomEvent('eip6963:announceProvider', {
				detail: Object.freeze({
					info: { uuid: `uuid-${rdns}`, name: rdns, icon: '', rdns },
					provider
				})
			})
		);
	});
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('discoverInjectedProviders', () => {
	it('collects announced providers and dedupes by rdns', async () => {
		const win = makeWindow();
		const provider = fakeProvider();
		announceOnRequest(win, 'dev.wallet.one', provider);
		announceOnRequest(win, 'dev.wallet.one', fakeProvider());
		announceOnRequest(win, 'dev.wallet.two', fakeProvider());
		vi.stubGlobal('window', win);

		const found = await discoverInjectedProviders(10);
		expect(found.map((d) => d.info.rdns).sort()).toEqual(['dev.wallet.one', 'dev.wallet.two']);
		// First announcement wins the rdns slot.
		expect(found.find((d) => d.info.rdns === 'dev.wallet.one')!.provider).toBe(provider);
	});

	it('falls back to a synthetic legacy entry for window.ethereum-only wallets', async () => {
		const win = makeWindow();
		const legacy = fakeProvider();
		win.ethereum = legacy;
		vi.stubGlobal('window', win);

		const found = await discoverInjectedProviders(10);
		expect(found).toHaveLength(1);
		expect(found[0]!.info.rdns).toBe(LEGACY_INJECTED_RDNS);
		expect(found[0]!.provider).toBe(legacy);
	});

	it('resolves empty without a window (SSR) and with nothing injected', async () => {
		await expect(discoverInjectedProviders(10)).resolves.toEqual([]);
		vi.stubGlobal('window', makeWindow());
		await expect(discoverInjectedProviders(10)).resolves.toEqual([]);
	});
});
