import type { EthereumProvider } from '$lib/privy/client.js';

/**
 * EIP-6963 injected-provider discovery (plan-2607-45 slice 03, FOR-502).
 * Mode D's owner connect is a native injected seam — it never touches
 * `$lib/privy/*`; that is the point of the mode.
 */

export interface Eip6963ProviderInfo {
	uuid: string;
	name: string;
	icon: string;
	rdns: string;
}

export interface Eip6963ProviderDetail {
	info: Eip6963ProviderInfo;
	provider: EthereumProvider;
}

/** EIP-1193 providers surface events; EIP-6963 wallets all implement this. */
export interface EventedEthereumProvider extends EthereumProvider {
	on?(event: string, listener: (...args: unknown[]) => void): void;
	removeListener?(event: string, listener: (...args: unknown[]) => void): void;
}

/** Synthetic rdns for a legacy `window.ethereum`-only wallet. */
export const LEGACY_INJECTED_RDNS = 'window.ethereum';

/**
 * Discover injected wallets: dispatch `eip6963:requestProvider`, collect the
 * `eip6963:announceProvider` responses for `timeoutMs`, dedupe by rdns. When
 * nothing announces but a legacy `window.ethereum` exists, surface that as a
 * single synthetic entry so pre-6963 wallets still connect.
 */
export function discoverInjectedProviders(timeoutMs = 300): Promise<Eip6963ProviderDetail[]> {
	if (typeof window === 'undefined') return Promise.resolve([]);
	return new Promise((resolve) => {
		const byRdns = new Map<string, Eip6963ProviderDetail>();
		const onAnnounce = (event: Event) => {
			const detail = (event as CustomEvent<Eip6963ProviderDetail>).detail;
			if (detail?.info?.rdns && detail.provider && !byRdns.has(detail.info.rdns)) {
				byRdns.set(detail.info.rdns, detail);
			}
		};
		window.addEventListener('eip6963:announceProvider', onAnnounce);
		window.dispatchEvent(new Event('eip6963:requestProvider'));
		setTimeout(() => {
			window.removeEventListener('eip6963:announceProvider', onAnnounce);
			if (byRdns.size === 0) {
				const legacy = (window as { ethereum?: EthereumProvider }).ethereum;
				if (legacy) {
					byRdns.set(LEGACY_INJECTED_RDNS, {
						info: {
							uuid: LEGACY_INJECTED_RDNS,
							name: 'Injected wallet',
							icon: '',
							rdns: LEGACY_INJECTED_RDNS
						},
						provider: legacy
					});
				}
			}
			resolve([...byRdns.values()]);
		}, timeoutMs);
	});
}
