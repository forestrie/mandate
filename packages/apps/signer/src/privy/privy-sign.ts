import { hashSigStructure, parsePrivyRecoverableSignature } from './sig-utils.js';

export interface PrivySignConfig {
	appId: string;
	appSecret: string;
	walletId: string;
	apiBase?: string;
	authorizationSignature?: string;
	fetchImpl?: typeof fetch;
}

export async function privySecp256k1Sign(
	sigStructureBytes: Uint8Array,
	config: PrivySignConfig
): Promise<Uint8Array> {
	const fetchImpl = config.fetchImpl ?? fetch;
	const hash = hashSigStructure(sigStructureBytes);
	const hashHex = `0x${Buffer.from(hash).toString('hex')}`;
	const basicAuth = Buffer.from(`${config.appId}:${config.appSecret}`).toString('base64');
	const apiBase = (config.apiBase ?? 'https://api.privy.io').replace(/\/$/, '');
	const headers: Record<string, string> = {
		Authorization: `Basic ${basicAuth}`,
		'Content-Type': 'application/json',
		'privy-app-id': config.appId
	};
	if (config.authorizationSignature) {
		headers['privy-authorization-signature'] = config.authorizationSignature;
	}

	const url = `${apiBase}/v1/wallets/${config.walletId}/rpc`;
	const response = await fetchImpl(url, {
		method: 'POST',
		headers,
		body: JSON.stringify({
			chain_type: 'ethereum',
			method: 'secp256k1_sign',
			params: { hash: hashHex, encoding: 'hex' }
		})
	});

	if (!response.ok) {
		const detail = await response.text();
		throw new PrivySignError(`Privy secp256k1_sign failed: ${response.status} ${detail}`);
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
