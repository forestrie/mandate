import { p256 } from '@noble/curves/p256';
import { canonicalizeJson, normalizePrivyAuthorizationBody } from './jcs.js';

export interface PrivyAuthorizationSignatureInput {
	method: string;
	url: string;
	body: Record<string, unknown>;
	appId: string;
	authorizationKey: string | undefined;
	/** Unix seconds for `privy-request-expiry` (signed and sent on the HTTP request). */
	requestExpirySeconds: number;
}

const importedKeyCache = new Map<string, CryptoKey>();

/**
 * Privy owned-wallet authorization signature.
 *
 * Scheme (Privy docs / @privy-io/node):
 *   1. Payload `{ version: 1, method, url, body, headers: { 'privy-app-id', ... } }`
 *      (`body` is `""` when the RPC body object is empty, per Privy).
 *   2. RFC 8785 (JCS) canonicalize → UTF-8 bytes.
 *   3. ECDSA P-256 over SHA-256; DER-encode; base64.
 *   4. Auth key is base64 PKCS#8 DER, optionally prefixed with `wallet-auth:`.
 *
 * Web Crypto `subtle.sign` for ECDSA returns IEEE P1363 compact r||s (64 bytes);
 * we DER-encode via @noble/curves/p256 for Privy.
 *
 * Returns `undefined` for app-controlled wallets (no authorization key).
 */
export async function buildPrivyAuthorizationSignature(
	input: PrivyAuthorizationSignatureInput
): Promise<string | undefined> {
	if (!input.authorizationKey?.trim()) return undefined;

	const headers: Record<string, string> = {
		'privy-app-id': input.appId,
		'privy-request-expiry': String(input.requestExpirySeconds)
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
	assertCompactEcdsaSignature(rawSignature);
	const der = p256.Signature.fromCompact(rawSignature).toDERRawBytes();
	return Buffer.from(der).toString('base64');
}

function assertCompactEcdsaSignature(signature: Uint8Array): void {
	if (signature.length !== 64) {
		throw new Error(
			`expected Web Crypto ECDSA P-1363 compact signature (64 bytes), got ${signature.length}`
		);
	}
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
