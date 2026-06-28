import Privy, {
	LocalStorage,
	getEntropyDetailsFromUser,
	getUserEmbeddedEthereumWallet
} from '@privy-io/js-sdk-core';
import { PUBLIC_MANDATE_PRIVY_APP_ID, PUBLIC_MANDATE_PRIVY_CLIENT_ID } from '$env/static/public';

/** Build-time only — set for Playwright preview builds; omitted from production CI. */
const E2E_PRIVY_MOCK = import.meta.env.VITE_E2E_PRIVY_MOCK === 'true';

let privyClient: Privy | null = null;
let initPromise: Promise<Privy> | null = null;
let mockInitPromise: Promise<Privy> | null = null;

export function isE2ePrivyMock(): boolean {
	return E2E_PRIVY_MOCK;
}

export function getPrivyAppId(): string {
	const appId = PUBLIC_MANDATE_PRIVY_APP_ID?.trim();
	if (!appId) {
		throw new Error('PUBLIC_MANDATE_PRIVY_APP_ID is not configured');
	}
	return appId;
}

export function getPrivyClientId(): string | undefined {
	const clientId = PUBLIC_MANDATE_PRIVY_CLIENT_ID?.trim();
	return clientId || undefined;
}

export async function getPrivyClient(): Promise<Privy> {
	if (typeof window === 'undefined') {
		throw new Error('Privy client is browser-only');
	}
	if (E2E_PRIVY_MOCK) {
		if (!mockInitPromise) {
			mockInitPromise = import('./mock-client.js').then(
				(m) => m.createMockPrivyClient() as unknown as Privy
			);
		}
		return (await mockInitPromise) as unknown as Privy;
	}
	if (privyClient) return privyClient;
	if (initPromise) return initPromise;

	initPromise = (async () => {
		const client = new Privy({
			appId: getPrivyAppId(),
			clientId: getPrivyClientId(),
			storage: new LocalStorage()
		});
		await client.initialize();
		privyClient = client;
		return client;
	})();

	return initPromise;
}

export type EthereumProvider = {
	request(args: { method: string; params?: unknown[] }): Promise<unknown>;
};

export async function getConnectedEthereumProvider(): Promise<EthereumProvider | null> {
	if (E2E_PRIVY_MOCK) {
		const { mockEthereumProviderWhenAuthenticated } = await import('./mock-client.js');
		return mockEthereumProviderWhenAuthenticated();
	}
	const privy = await getPrivyClient();
	const { user } = await privy.user.get();
	if (!user) return null;

	const wallet = getUserEmbeddedEthereumWallet(user);
	if (!wallet) return null;

	const details = getEntropyDetailsFromUser(user);
	if (!details) return null;

	const { entropyId, entropyIdVerifier } = details;
	const provider = await privy.embeddedWallet.getEthereumProvider({
		wallet,
		entropyId,
		entropyIdVerifier
	});
	return provider as EthereumProvider;
}

export async function getConnectedWalletAddress(): Promise<string | null> {
	if (E2E_PRIVY_MOCK) {
		const { mockWalletAddressWhenAuthenticated } = await import('./mock-client.js');
		return mockWalletAddressWhenAuthenticated();
	}
	const privy = await getPrivyClient();
	const { user } = await privy.user.get();
	if (!user) return null;
	const wallet = getUserEmbeddedEthereumWallet(user);
	return wallet?.address ?? null;
}

export function resetPrivyClient(): void {
	privyClient = null;
	initPromise = null;
	mockInitPromise = null;
	if (E2E_PRIVY_MOCK) {
		void import('./mock-client.js').then((m) => m.resetMockPrivyAuthState());
	}
}
