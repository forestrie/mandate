import {
	bytesToBase64,
	hashSigStructure,
	parsePrivyRecoverableSignature,
	signRecoverableLowS
} from './sig-utils.js';
import type { SignerBackend } from './harness.js';

export interface PrivyBackendConfig {
	appId: string;
	appSecret: string;
	walletId: string;
	authorizationSignature?: string;
	fetchImpl?: typeof fetch;
}

/**
 * Mock Privy backend: signs locally but returns Privy-shaped hex so the
 * parse/normalize path is exercised offline.
 */
export function createPrivyMockBackend(privateKey: Uint8Array): SignerBackend {
	return async (sigStructureBytes) => {
		const hash = hashSigStructure(sigStructureBytes);
		const sig = signRecoverableLowS(hash, privateKey);
		// emulate Privy v=27/28 encoding
		const privyStyle = new Uint8Array(sig);
		privyStyle[64] = privyStyle[64]! + 27;
		const hex = `0x${Buffer.from(privyStyle).toString('hex')}`;
		return parsePrivyRecoverableSignature(hex);
	};
}

export function createPrivyLiveBackend(config: PrivyBackendConfig): SignerBackend {
	const fetchImpl = config.fetchImpl ?? fetch;
	const basicAuth = Buffer.from(`${config.appId}:${config.appSecret}`).toString('base64');

	return async (sigStructureBytes) => {
		const hash = hashSigStructure(sigStructureBytes);
		const hashHex = `0x${Buffer.from(hash).toString('hex')}`;
		const headers: Record<string, string> = {
			Authorization: `Basic ${basicAuth}`,
			'Content-Type': 'application/json',
			'privy-app-id': config.appId
		};
		if (config.authorizationSignature) {
			headers['privy-authorization-signature'] = config.authorizationSignature;
		}

		const url = `https://api.privy.io/v1/wallets/${config.walletId}/rpc`;
		const response = await fetchImpl(url, {
			method: 'POST',
			headers,
			body: JSON.stringify({
				chain_type: 'ethereum',
				method: 'secp256k1_sign',
				// Privy rejects an `encoding` key in secp256k1_sign params (HTTP 400).
				params: { hash: hashHex }
			})
		});

		if (!response.ok) {
			const detail = await response.text();
			throw new Error(`Privy secp256k1_sign failed: ${response.status} ${detail}`);
		}

		const body = (await response.json()) as {
			data?: { signature?: string };
			signature?: string;
		};
		const hex = body.data?.signature ?? body.signature;
		if (!hex) {
			throw new Error('Privy response missing signature');
		}
		return parsePrivyRecoverableSignature(hex);
	};
}

export function privyEnvConfigured(): boolean {
	return Boolean(
		process.env.PRIVY_APP_ID && process.env.PRIVY_APP_SECRET && process.env.PRIVY_WALLET_ID
	);
}

export function createPrivyBackendFromEnv(privateKeyForMock: Uint8Array): {
	mode: 'mock' | 'live';
	backend: SignerBackend;
} {
	if (process.env.SPIKE_LIVE === '1' && privyEnvConfigured()) {
		return {
			mode: 'live',
			backend: createPrivyLiveBackend({
				appId: process.env.PRIVY_APP_ID!,
				appSecret: process.env.PRIVY_APP_SECRET!,
				walletId: process.env.PRIVY_WALLET_ID!,
				authorizationSignature: process.env.PRIVY_AUTHORIZATION_SIGNATURE
			})
		};
	}
	return { mode: 'mock', backend: createPrivyMockBackend(privateKeyForMock) };
}

/** Documented agent remote-signer HTTP shape (FOR-98). */
export function buildRemoteSignerRequest(sigStructureBytes: Uint8Array): {
	sigStructure: string;
} {
	return { sigStructure: bytesToBase64(sigStructureBytes) };
}
