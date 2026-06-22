import { generateKeyPairSync } from 'node:crypto';
import { p256 } from '@noble/curves/p256';
import { describe, expect, it } from 'vitest';
import {
	buildPrivyAuthorizationSignature,
	clearAuthorizationKeyCache
} from '../src/privy/authorization-signature.js';
import { canonicalizeJson } from '../src/privy/jcs.js';

const REQUEST_EXPIRY = 1_700_000_060;

function testAuthorizationKey(): string {
	const { privateKey } = generateKeyPairSync('ec', {
		namedCurve: 'P-256',
		privateKeyEncoding: { type: 'pkcs8', format: 'der' },
		publicKeyEncoding: { type: 'spki', format: 'der' }
	});
	return `wallet-auth:${Buffer.from(privateKey).toString('base64')}`;
}

async function verifyAuthorizationSignature(
	signatureBase64: string,
	payload: Record<string, unknown>,
	publicKeySpkiDer: Buffer
): Promise<boolean> {
	const jcsBytes = new TextEncoder().encode(canonicalizeJson(payload));
	const publicKey = await crypto.subtle.importKey(
		'spki',
		new Uint8Array(publicKeySpkiDer),
		{ name: 'ECDSA', namedCurve: 'P-256' },
		false,
		['verify']
	);
	const der = new Uint8Array(Buffer.from(signatureBase64, 'base64'));
	const raw = p256.Signature.fromDER(der).toCompactRawBytes();
	return crypto.subtle.verify(
		{ name: 'ECDSA', hash: 'SHA-256' },
		publicKey,
		new Uint8Array(raw),
		jcsBytes
	);
}

describe('buildPrivyAuthorizationSignature', () => {
	it('returns undefined when authorizationKey is unset', async () => {
		const result = await buildPrivyAuthorizationSignature({
			method: 'POST',
			url: 'https://api.privy.io/v1/wallets/w1/rpc',
			body: { method: 'secp256k1_sign' },
			appId: 'app-id',
			authorizationKey: undefined,
			requestExpirySeconds: REQUEST_EXPIRY
		});
		expect(result).toBeUndefined();
	});

	it('strips wallet-auth: prefix and produces a verifiable DER signature', async () => {
		const { privateKey, publicKey } = generateKeyPairSync('ec', {
			namedCurve: 'P-256',
			privateKeyEncoding: { type: 'pkcs8', format: 'der' },
			publicKeyEncoding: { type: 'spki', format: 'der' }
		});
		const authorizationKey = `wallet-auth:${Buffer.from(privateKey).toString('base64')}`;
		const body = {
			chain_type: 'ethereum',
			method: 'secp256k1_sign',
			params: { hash: '0xdeadbeef' }
		};
		const url = 'https://api.privy.io/v1/wallets/wallet-1/rpc';
		const appId = 'app-123';

		const signature = await buildPrivyAuthorizationSignature({
			method: 'POST',
			url,
			body,
			appId,
			authorizationKey,
			requestExpirySeconds: REQUEST_EXPIRY
		});

		expect(signature).toBeTruthy();
		const payload = {
			version: 1,
			method: 'POST',
			url,
			body,
			headers: {
				'privy-app-id': appId,
				'privy-request-expiry': String(REQUEST_EXPIRY)
			}
		};
		expect(await verifyAuthorizationSignature(signature!, payload, publicKey)).toBe(true);
	});

	it('includes privy-request-expiry in the signed headers', async () => {
		const { privateKey, publicKey } = generateKeyPairSync('ec', {
			namedCurve: 'P-256',
			privateKeyEncoding: { type: 'pkcs8', format: 'der' },
			publicKeyEncoding: { type: 'spki', format: 'der' }
		});
		const authorizationKey = `wallet-auth:${Buffer.from(privateKey).toString('base64')}`;
		const expiry = 1_800_000_000;
		const signature = await buildPrivyAuthorizationSignature({
			method: 'POST',
			url: 'https://api.privy.io/v1/wallets/w1/rpc',
			body: { method: 'secp256k1_sign', params: { hash: '0x1' } },
			appId: 'app-id',
			authorizationKey,
			requestExpirySeconds: expiry
		});
		const payload = {
			version: 1,
			method: 'POST',
			url: 'https://api.privy.io/v1/wallets/w1/rpc',
			body: { method: 'secp256k1_sign', params: { hash: '0x1' } },
			headers: {
				'privy-app-id': 'app-id',
				'privy-request-expiry': String(expiry)
			}
		};
		expect(await verifyAuthorizationSignature(signature!, payload, publicKey)).toBe(true);
	});

	it('omits body from the signed payload when rpc body is empty', async () => {
		const { privateKey, publicKey } = generateKeyPairSync('ec', {
			namedCurve: 'P-256',
			privateKeyEncoding: { type: 'pkcs8', format: 'der' },
			publicKeyEncoding: { type: 'spki', format: 'der' }
		});
		const authorizationKey = `wallet-auth:${Buffer.from(privateKey).toString('base64')}`;
		const url = 'https://api.privy.io/v1/wallets/wallet-1/rpc';
		const appId = 'app-123';

		const signature = await buildPrivyAuthorizationSignature({
			method: 'POST',
			url,
			body: {},
			appId,
			authorizationKey,
			requestExpirySeconds: REQUEST_EXPIRY
		});

		const payload = {
			version: 1,
			method: 'POST',
			url,
			body: '',
			headers: {
				'privy-app-id': appId,
				'privy-request-expiry': String(REQUEST_EXPIRY)
			}
		};
		expect(await verifyAuthorizationSignature(signature!, payload, publicKey)).toBe(true);
	});

	it('accepts authorization key without wallet-auth: prefix', async () => {
		const { privateKey, publicKey } = generateKeyPairSync('ec', {
			namedCurve: 'P-256',
			privateKeyEncoding: { type: 'pkcs8', format: 'der' },
			publicKeyEncoding: { type: 'spki', format: 'der' }
		});
		const authorizationKey = Buffer.from(privateKey).toString('base64');
		const body = { method: 'secp256k1_sign', params: { hash: '0x1' } };

		const signature = await buildPrivyAuthorizationSignature({
			method: 'POST',
			url: 'https://api.privy.io/v1/wallets/w1/rpc',
			body,
			appId: 'app-id',
			authorizationKey,
			requestExpirySeconds: REQUEST_EXPIRY
		});

		const payload = {
			version: 1,
			method: 'POST',
			url: 'https://api.privy.io/v1/wallets/w1/rpc',
			body,
			headers: {
				'privy-app-id': 'app-id',
				'privy-request-expiry': String(REQUEST_EXPIRY)
			}
		};
		expect(await verifyAuthorizationSignature(signature!, payload, publicKey)).toBe(true);
	});

	it('works with a generated wallet-auth key (smoke)', async () => {
		const authorizationKey = testAuthorizationKey();
		const signature = await buildPrivyAuthorizationSignature({
			method: 'POST',
			url: 'https://api.privy.io/v1/wallets/w1/rpc',
			body: { chain_type: 'ethereum', method: 'secp256k1_sign', params: { hash: '0x1' } },
			appId: 'app-id',
			authorizationKey,
			requestExpirySeconds: REQUEST_EXPIRY
		});
		expect(signature).toMatch(/^[A-Za-z0-9+/]+=*$/);
	});

	it('reuses cached imported authorization key', async () => {
		clearAuthorizationKeyCache();
		const authorizationKey = testAuthorizationKey();
		const input = {
			method: 'POST',
			url: 'https://api.privy.io/v1/wallets/w1/rpc',
			body: { method: 'secp256k1_sign', params: { hash: '0x1' } },
			appId: 'app-id',
			authorizationKey,
			requestExpirySeconds: REQUEST_EXPIRY
		};
		const first = await buildPrivyAuthorizationSignature(input);
		const second = await buildPrivyAuthorizationSignature(input);
		expect(first).toBeTruthy();
		expect(second).toBeTruthy();
	});
});
