import Privy, {
	LocalStorage,
	getEntropyDetailsFromUser,
	getUserEmbeddedEthereumWallet
} from '@privy-io/js-sdk-core';
import { PUBLIC_PRIVY_APP_ID, PUBLIC_PRIVY_CLIENT_ID } from '$env/static/public';

let privyClient: Privy | null = null;
let initPromise: Promise<Privy> | null = null;

export function getPrivyAppId(): string {
	const appId = PUBLIC_PRIVY_APP_ID?.trim();
	if (!appId) {
		throw new Error('PUBLIC_PRIVY_APP_ID is not configured');
	}
	return appId;
}

export function getPrivyClientId(): string | undefined {
	const clientId = PUBLIC_PRIVY_CLIENT_ID?.trim();
	return clientId || undefined;
}

export async function getPrivyClient(): Promise<Privy> {
	if (typeof window === 'undefined') {
		throw new Error('Privy client is browser-only');
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
	const privy = await getPrivyClient();
	const { user } = await privy.user.get();
	if (!user) return null;
	const wallet = getUserEmbeddedEthereumWallet(user);
	return wallet?.address ?? null;
}

export function resetPrivyClient(): void {
	privyClient = null;
	initPromise = null;
}
