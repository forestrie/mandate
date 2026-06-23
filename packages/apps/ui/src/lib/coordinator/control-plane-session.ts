import { browser } from '$app/environment';
import type { ControlPlaneScope } from '@mandate/coordinator-types';
import { buildKs256ControlPlaneMessage } from '@mandate/coordinator-types';
import { getConnectedEthereumProvider, getConnectedWalletAddress } from '$lib/privy/client.js';
import type { WalletChallengeEnvelope } from '@mandate/coordinator-types';
import {
	ensureCachedControlPlaneSession,
	type CachedControlPlaneSession
} from './control-plane-session-core.js';

const cache = new Map<string, CachedControlPlaneSession>();

async function signKs256Envelope(envelope: WalletChallengeEnvelope): Promise<string> {
	const provider = await getConnectedEthereumProvider();
	if (!provider) {
		throw new Error('Connect a wallet before signing the control-plane challenge.');
	}
	const message = buildKs256ControlPlaneMessage(envelope);
	const address = await getConnectedWalletAddress();
	if (!address) {
		throw new Error('Connect a wallet before signing the control-plane challenge.');
	}
	const signature = (await provider.request({
		method: 'personal_sign',
		params: [message, address]
	})) as string;
	if (!signature?.startsWith('0x')) {
		throw new Error('Wallet returned an invalid signature');
	}
	return signature;
}

export async function ensureControlPlaneSession(
	authLogId: string,
	scopes: ControlPlaneScope[]
): Promise<CachedControlPlaneSession> {
	if (!browser) {
		throw new Error('Control-plane sessions are only available in the browser');
	}

	return ensureCachedControlPlaneSession(authLogId, scopes, cache, {
		fetch,
		signMessage: signKs256Envelope
	});
}

export function clearControlPlaneSession(authLogId?: string): void {
	if (!authLogId) {
		cache.clear();
		return;
	}
	for (const key of cache.keys()) {
		if (key.startsWith(`${authLogId}:`)) {
			cache.delete(key);
		}
	}
}

export async function controlPlaneAuthHeaders(
	authLogId: string,
	scopes: ControlPlaneScope[]
): Promise<HeadersInit> {
	const session = await ensureControlPlaneSession(authLogId, scopes);
	return { Authorization: `Bearer ${session.token}` };
}
