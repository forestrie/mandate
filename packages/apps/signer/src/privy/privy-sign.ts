import { hashSigStructure, parsePrivyRecoverableSignature } from './sig-utils.js';
import { buildPrivyAuthorizationSignature } from './authorization-signature.js';

export interface PrivySignConfig {
	appId: string;
	appSecret: string;
	walletId: string;
	apiBase?: string;
	/** `wallet-auth:`-prefixed base64 PKCS#8 P-256 key for owned-wallet RPC. */
	authorizationKey?: string;
	/** Seconds added to now for `privy-request-expiry` (default 60). */
	requestExpirySkewSeconds?: number;
	nowSeconds?: number;
	fetchImpl?: typeof fetch;
}

const DEFAULT_REQUEST_EXPIRY_SKEW_SECONDS = 60;

export async function privySecp256k1Sign(
	sigStructureBytes: Uint8Array,
	config: PrivySignConfig
): Promise<Uint8Array> {
	const fetchImpl = config.fetchImpl ?? fetch;
	const hash = hashSigStructure(sigStructureBytes);
	const hashHex = `0x${Buffer.from(hash).toString('hex')}`;
	const basicAuth = Buffer.from(`${config.appId}:${config.appSecret}`).toString('base64');
	const apiBase = (config.apiBase ?? 'https://api.privy.io').replace(/\/$/, '');
	const url = `${apiBase}/v1/wallets/${config.walletId}/rpc`;
	const rpcBody = {
		chain_type: 'ethereum',
		method: 'secp256k1_sign',
		// Privy's secp256k1_sign rejects an `encoding` key in params (it only
		// appears on the response). Sending it returns HTTP 400 invalid_data.
		params: { hash: hashHex }
	};

	const nowSeconds = config.nowSeconds ?? Math.floor(Date.now() / 1000);
	const requestExpirySeconds =
		nowSeconds + (config.requestExpirySkewSeconds ?? DEFAULT_REQUEST_EXPIRY_SKEW_SECONDS);

	const authorizationSignature = await buildPrivyAuthorizationSignature({
		method: 'POST',
		url,
		body: rpcBody,
		appId: config.appId,
		authorizationKey: config.authorizationKey,
		requestExpirySeconds
	});

	const headers: Record<string, string> = {
		Authorization: `Basic ${basicAuth}`,
		'Content-Type': 'application/json',
		'privy-app-id': config.appId
	};
	if (authorizationSignature) {
		headers['privy-authorization-signature'] = authorizationSignature;
		headers['privy-request-expiry'] = String(requestExpirySeconds);
	}

	const response = await fetchImpl(url, {
		method: 'POST',
		headers,
		body: JSON.stringify(rpcBody)
	});

	if (!response.ok) {
		const detail = await response.text();
		console.error(`Privy secp256k1_sign failed: ${response.status} ${detail}`);
		throw new PrivySignError('Privy secp256k1_sign failed');
	}

	const body = (await response.json()) as {
		data?: { signature?: string };
		signature?: string;
	};
	const hex = body.data?.signature ?? body.signature;
	if (!hex) {
		throw new PrivySignError('Privy response missing signature');
	}
	return parsePrivyRecoverableSignature(hex);
}

export class PrivySignError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'PrivySignError';
	}
}
