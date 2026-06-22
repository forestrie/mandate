import { p256 } from '@noble/curves/p256';
import { canonicalizeJson, normalizePrivyAuthorizationBody } from './jcs.js';

export interface PrivyAuthorizationSignatureInput {
	method: string;
	url: string;
	body: Record<string, unknown>;
	appId: string;
	authorizationKey: string | undefined;
	/** Unix milliseconds for `privy-request-expiry`. */
	requestExpiryMs: number;
}

const importedKeyCache = new Map<string, CryptoKey>();

/** Build Privy `privy-authorization-signature` for owned-wallet admin RPC. */
export async function buildPrivyAuthorizationSignature(
	input: PrivyAuthorizationSignatureInput
): Promise<string | undefined> {
	if (!input.authorizationKey?.trim()) return undefined;

	const headers: Record<string, string> = {
		'privy-app-id': input.appId,
		'privy-request-expiry': String(input.requestExpiryMs)
	};

	const payload: Record<string, unknown> = {
		version: 1,
		method: input.method,
		url: input.url,
		headers,
		body: normalizePrivyAuthorizationBody(input.body)
	};

	const jcsBytes = new TextEncoder().encode(canonicalizeJson(payload));
	const privateKey = await importAuthorizationPrivateKey(input.authorizationKey);
	const rawSignature = new Uint8Array(
		await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, jcsBytes)
	);
	if (rawSignature.length !== 64) {
		throw new Error(
			`expected Web Crypto ECDSA P-1363 compact signature (64 bytes), got ${rawSignature.length}`
		);
	}
	const der = p256.Signature.fromCompact(rawSignature).toDERRawBytes();
	return Buffer.from(der).toString('base64');
}

async function importAuthorizationPrivateKey(authorizationKey: string): Promise<CryptoKey> {
	const trimmed = authorizationKey.trim();
	const cached = importedKeyCache.get(trimmed);
	if (cached) return cached;

	const base64 = trimmed.startsWith('wallet-auth:')
		? trimmed.slice('wallet-auth:'.length)
		: trimmed;
	const der = Buffer.from(base64, 'base64');
	const key = await crypto.subtle.importKey(
		'pkcs8',
		der,
		{ name: 'ECDSA', namedCurve: 'P-256' },
		false,
		['sign']
	);
	importedKeyCache.set(trimmed, key);
	return key;
}

/** @internal test-only */
export function clearAuthorizationKeyCache(): void {
	importedKeyCache.clear();
}
