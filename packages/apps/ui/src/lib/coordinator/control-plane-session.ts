import { browser } from '$app/environment';
import type { ControlPlaneScope } from '@mandate/coordinator-types';
import { getConnectedEthereumProvider, getConnectedWalletAddress } from '$lib/privy/client.js';
import { isBurnerBackend } from '$lib/signing/resolve-backend.js';
import { signBurnerPersonalMessage } from '$lib/signing/local-burner-personal-sign.js';
import {
	ensureCachedControlPlaneSession,
	type CachedControlPlaneSession
} from './control-plane-session-core.js';

const cache = new Map<string, CachedControlPlaneSession>();

async function signKs256Message(message: string): Promise<string> {
	// Burner mode (plan-2607-01/FOR-322): sign the challenge with the browser-local
	// key so the console needs no Privy wallet. Server recovers the burner address
	// via EIP-191 and authorises it against the log.
	if (isBurnerBackend()) {
		return signBurnerPersonalMessage(message);
	}
	const provider = await getConnectedEthereumProvider();
	if (!provider) {
		throw new Error('Connect a wallet before signing the control-plane challenge.');
	}
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
		signMessage: signKs256Message
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
