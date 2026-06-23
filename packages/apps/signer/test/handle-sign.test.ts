import { generateKeyPairSync } from 'node:crypto';
import { p256 } from '@noble/curves/p256';
import { secp256k1 } from '@noble/curves/secp256k1';
import { describe, expect, it, vi } from 'vitest';
import { handleSign } from '../src/handle-sign.js';
import type { Env } from '../src/env.js';
import { canonicalizeJson } from '../src/privy/jcs.js';
import {
	addressFromUncompressedPubkey,
	base64ToBytes,
	bytesToBigIntBE,
	bytesToBase64,
	hashSigStructure,
	recoverAddressFromSignature,
	signRecoverableHighS,
	signRecoverableLowS
} from './test-helpers.js';

const TEST_LOG_ID = 'b2c3d4e5f67890ab1234567890abcdef';
const SIGNER_TOKEN = 'test-signer-token';
const TEST_PRIVY_API_BASE = 'https://privy.test';

function createEnv(opts: {
	privateKey: Uint8Array;
	keyRef?: string;
	logIds?: string[];
	requiresAuthorizationSignature?: boolean;
}): Env {
	const pub = secp256k1.getPublicKey(opts.privateKey, false);
	const rootSignerAddress = `0x${Buffer.from(addressFromUncompressedPubkey(pub)).toString('hex')}`;
	const keyRef = opts.keyRef ?? 'test-key';
	return {
		MANDATE_SIGNER_TOKEN: SIGNER_TOKEN,
		MANDATE_PRIVY_APP_ID: 'app-id',
		MANDATE_PRIVY_APP_SECRET: 'app-secret',
		MANDATE_PRIVY_API_BASE: TEST_PRIVY_API_BASE,
		KEY_DIRECTORY: JSON.stringify({
			[keyRef]: {
				walletId: 'wallet-1',
				rootSignerAddress,
				logIds: opts.logIds ?? [TEST_LOG_ID],
				...(opts.requiresAuthorizationSignature !== undefined
					? { requiresAuthorizationSignature: opts.requiresAuthorizationSignature }
					: {})
			}
		})
	};
}

function signRequest(opts: {
	privateKey: Uint8Array;
	sigStructure?: Uint8Array;
	bearer?: string;
	keyRef?: string;
	logId?: string;
	rootSignerAddress?: string;
}): Request {
	const pub = secp256k1.getPublicKey(opts.privateKey, false);
	const rootSignerAddress =
		opts.rootSignerAddress ??
		`0x${Buffer.from(addressFromUncompressedPubkey(pub)).toString('hex')}`;
	const sigStructure = opts.sigStructure ?? new Uint8Array([1, 2, 3, 4]);
	return new Request('http://signer.test/v1/sign', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${opts.bearer ?? SIGNER_TOKEN}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			logId: opts.logId ?? TEST_LOG_ID,
			keyRef: opts.keyRef ?? 'test-key',
			rootSignerAddress,
			sigStructure: bytesToBase64(sigStructure)
		})
	});
}

function mockPrivyFetch(
	privateKey: Uint8Array,
	sigStructure: Uint8Array,
	signer: (hash: Uint8Array, privateKey: Uint8Array) => Uint8Array = signRecoverableLowS
): typeof fetch {
	return vi.fn(async () => {
		const hash = hashSigStructure(sigStructure);
		const sig = signer(hash, privateKey);
		const privyStyle = new Uint8Array(sig);
		privyStyle[64] = privyStyle[64]! + 27;
		return new Response(
			JSON.stringify({
				data: { signature: `0x${Buffer.from(privyStyle).toString('hex')}` }
			}),
			{ status: 200 }
		);
	}) as typeof fetch;
}

describe('handleSign', () => {
	it('returns 65-byte signature recovering to rootSignerAddress', async () => {
		const privateKey = secp256k1.utils.randomPrivateKey();
		const env = createEnv({ privateKey });
		const sigStructure = new Uint8Array([1, 2, 3, 4]);
		const response = await handleSign(signRequest({ privateKey, sigStructure }), {
			env,
			fetchImpl: mockPrivyFetch(privateKey, sigStructure)
		});
		expect(response.status).toBe(200);
		const body = (await response.json()) as { signature: string };
		const signature = base64ToBytes(body.signature);
		expect(signature.length).toBe(65);
		const hash = hashSigStructure(sigStructure);
		const recovered = recoverAddressFromSignature(hash, signature);
		const pub = secp256k1.getPublicKey(privateKey, false);
		const expected = addressFromUncompressedPubkey(pub);
		expect(recovered).toEqual(expected);
	});

	it('sends Privy secp256k1_sign with only a hash param (no encoding key)', async () => {
		const privateKey = secp256k1.utils.randomPrivateKey();
		const env = createEnv({ privateKey });
		const sigStructure = new Uint8Array([1, 2, 3, 4]);
		let capturedHeaders: Record<string, string> = {};
		let capturedBody: { method?: string; params?: Record<string, unknown> } = {};
		const fetchImpl = vi.fn(async (_url: unknown, init: RequestInit) => {
			capturedHeaders = Object.fromEntries(new Headers(init.headers).entries());
			capturedBody = JSON.parse(init.body as string);
			const hash = hashSigStructure(sigStructure);
			const sig = signRecoverableLowS(hash, privateKey);
			const privyStyle = new Uint8Array(sig);
			privyStyle[64] = privyStyle[64]! + 27;
			return new Response(
				JSON.stringify({ data: { signature: `0x${Buffer.from(privyStyle).toString('hex')}` } }),
				{ status: 200 }
			);
		}) as unknown as typeof fetch;
		const response = await handleSign(signRequest({ privateKey, sigStructure }), {
			env,
			fetchImpl
		});
		expect(response.status).toBe(200);
		expect(capturedBody.method).toBe('secp256k1_sign');
		// Privy returns HTTP 400 invalid_data if params carries an `encoding` key.
		expect(Object.keys(capturedBody.params ?? {})).toEqual(['hash']);
		expect(capturedHeaders['privy-authorization-signature']).toBeUndefined();
	});

	it('normalizes a high-s Privy signature to low-s and still recovers', async () => {
		const privateKey = secp256k1.utils.randomPrivateKey();
		const env = createEnv({ privateKey });
		const sigStructure = new Uint8Array([1, 2, 3, 4]);
		const response = await handleSign(signRequest({ privateKey, sigStructure }), {
			env,
			fetchImpl: mockPrivyFetch(privateKey, sigStructure, signRecoverableHighS)
		});
		expect(response.status).toBe(200);
		const body = (await response.json()) as { signature: string };
		const signature = base64ToBytes(body.signature);
		const s = bytesToBigIntBE(signature.slice(32, 64));
		expect(s <= secp256k1.CURVE.n >> 1n).toBe(true);
		const hash = hashSigStructure(sigStructure);
		const recovered = recoverAddressFromSignature(hash, signature);
		const pub = secp256k1.getPublicKey(privateKey, false);
		expect(recovered).toEqual(addressFromUncompressedPubkey(pub));
	});

	it('rejects bad bearer with 401', async () => {
		const privateKey = secp256k1.utils.randomPrivateKey();
		const env = createEnv({ privateKey });
		const sigStructure = new Uint8Array([1, 2, 3, 4]);
		const response = await handleSign(signRequest({ privateKey, bearer: 'wrong-token' }), {
			env,
			fetchImpl: mockPrivyFetch(privateKey, sigStructure)
		});
		expect(response.status).toBe(401);
	});

	it('rejects unknown keyRef with 404', async () => {
		const privateKey = secp256k1.utils.randomPrivateKey();
		const env = createEnv({ privateKey });
		const sigStructure = new Uint8Array([1, 2, 3, 4]);
		const response = await handleSign(signRequest({ privateKey, keyRef: 'missing-key' }), {
			env,
			fetchImpl: mockPrivyFetch(privateKey, sigStructure)
		});
		expect(response.status).toBe(404);
	});

	it('rejects invalid logId with 400', async () => {
		const privateKey = secp256k1.utils.randomPrivateKey();
		const env = createEnv({ privateKey });
		const sigStructure = new Uint8Array([1, 2, 3, 4]);
		const response = await handleSign(signRequest({ privateKey, logId: 'not-hex' }), {
			env,
			fetchImpl: mockPrivyFetch(privateKey, sigStructure)
		});
		expect(response.status).toBe(400);
	});

	it('rejects oversized sigStructure with 400', async () => {
		const privateKey = secp256k1.utils.randomPrivateKey();
		const env = createEnv({ privateKey });
		const oversized = 'A'.repeat(90_000);
		const pub = secp256k1.getPublicKey(privateKey, false);
		const rootSignerAddress = `0x${Buffer.from(addressFromUncompressedPubkey(pub)).toString('hex')}`;
		const request = new Request('http://signer.test/v1/sign', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${SIGNER_TOKEN}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				logId: TEST_LOG_ID,
				keyRef: 'test-key',
				rootSignerAddress,
				sigStructure: oversized
			})
		});
		const response = await handleSign(request, {
			env,
			fetchImpl: mockPrivyFetch(privateKey, new Uint8Array([1]))
		});
		expect(response.status).toBe(400);
	});

	it('returns 500 when owned-wallet keyRef requires auth but MANDATE_PRIVY_AUTHORIZATION_KEY is unset', async () => {
		const privateKey = secp256k1.utils.randomPrivateKey();
		const env = createEnv({ privateKey, requiresAuthorizationSignature: true });
		const sigStructure = new Uint8Array([1, 2, 3, 4]);
		const response = await handleSign(signRequest({ privateKey, sigStructure }), {
			env,
			fetchImpl: mockPrivyFetch(privateKey, sigStructure)
		});
		expect(response.status).toBe(500);
		const body = (await response.json()) as { error: string };
		expect(body.error).toContain('MANDATE_PRIVY_AUTHORIZATION_KEY');
	});

	it('omits privy-authorization-signature when global key is set but keyRef does not require it', async () => {
		const privateKey = secp256k1.utils.randomPrivateKey();
		const { privateKey: authPrivateKey } = generateKeyPairSync('ec', {
			namedCurve: 'P-256',
			privateKeyEncoding: { type: 'pkcs8', format: 'der' },
			publicKeyEncoding: { type: 'spki', format: 'der' }
		});
		const env: Env = {
			...createEnv({ privateKey, requiresAuthorizationSignature: false }),
			MANDATE_PRIVY_AUTHORIZATION_KEY: `wallet-auth:${Buffer.from(authPrivateKey).toString('base64')}`
		};
		const sigStructure = new Uint8Array([1, 2, 3, 4]);
		let capturedHeaders: Record<string, string> = {};
		const fetchImpl = vi.fn(async (_url: unknown, init: RequestInit) => {
			capturedHeaders = Object.fromEntries(new Headers(init.headers).entries());
			const hash = hashSigStructure(sigStructure);
			const sig = signRecoverableLowS(hash, privateKey);
			const privyStyle = new Uint8Array(sig);
			privyStyle[64] = privyStyle[64]! + 27;
			return new Response(
				JSON.stringify({ data: { signature: `0x${Buffer.from(privyStyle).toString('hex')}` } }),
				{ status: 200 }
			);
		}) as unknown as typeof fetch;
		const response = await handleSign(signRequest({ privateKey, sigStructure }), {
			env,
			fetchImpl
		});
		expect(response.status).toBe(200);
		expect(capturedHeaders['privy-authorization-signature']).toBeUndefined();
	});

	it('rejects unknown logId with 404', async () => {
		const privateKey = secp256k1.utils.randomPrivateKey();
		const env = createEnv({ privateKey });
		const sigStructure = new Uint8Array([1, 2, 3, 4]);
		const response = await handleSign(signRequest({ privateKey, logId: 'f'.repeat(32) }), {
			env,
			fetchImpl: mockPrivyFetch(privateKey, sigStructure)
		});
		expect(response.status).toBe(404);
	});

	it('returns 500 when recovered address mismatches rootSignerAddress', async () => {
		const privateKey = secp256k1.utils.randomPrivateKey();
		const otherKey = secp256k1.utils.randomPrivateKey();
		const env = createEnv({ privateKey });
		const sigStructure = new Uint8Array([1, 2, 3, 4]);
		const response = await handleSign(signRequest({ privateKey }), {
			env,
			fetchImpl: mockPrivyFetch(otherKey, sigStructure)
		});
		expect(response.status).toBe(500);
		const body = (await response.json()) as { error: string };
		expect(body.error).toContain('recovered signer address');
	});

	it('sends privy-authorization-signature when keyRef requires owned-wallet auth', async () => {
		const privateKey = secp256k1.utils.randomPrivateKey();
		const { privateKey: authPrivateKey, publicKey: authPublicKey } = generateKeyPairSync('ec', {
			namedCurve: 'P-256',
			privateKeyEncoding: { type: 'pkcs8', format: 'der' },
			publicKeyEncoding: { type: 'spki', format: 'der' }
		});
		const env: Env = {
			...createEnv({ privateKey, requiresAuthorizationSignature: true }),
			MANDATE_PRIVY_AUTHORIZATION_KEY: `wallet-auth:${Buffer.from(authPrivateKey).toString('base64')}`
		};
		const sigStructure = new Uint8Array([1, 2, 3, 4]);
		const before = Date.now();
		let capturedUrl = '';
		let capturedHeaders: Record<string, string> = {};
		let capturedBody: Record<string, unknown> = {};
		const fetchImpl = vi.fn(async (url: unknown, init: RequestInit) => {
			capturedUrl = String(url);
			capturedHeaders = Object.fromEntries(new Headers(init.headers).entries());
			capturedBody = JSON.parse(init.body as string);
			const hash = hashSigStructure(sigStructure);
			const sig = signRecoverableLowS(hash, privateKey);
			const privyStyle = new Uint8Array(sig);
			privyStyle[64] = privyStyle[64]! + 27;
			return new Response(
				JSON.stringify({ data: { signature: `0x${Buffer.from(privyStyle).toString('hex')}` } }),
				{ status: 200 }
			);
		}) as unknown as typeof fetch;

		const response = await handleSign(signRequest({ privateKey, sigStructure }), {
			env,
			fetchImpl
		});
		const after = Date.now();
		expect(response.status).toBe(200);

		const authHeader = capturedHeaders['privy-authorization-signature'];
		expect(authHeader).toBeTruthy();
		const expiry = Number(capturedHeaders['privy-request-expiry']);
		expect(expiry).toBeGreaterThanOrEqual(before + 60_000);
		expect(expiry).toBeLessThanOrEqual(after + 60_000);

		const payload = {
			version: 1,
			method: 'POST',
			url: capturedUrl,
			body: capturedBody,
			headers: {
				'privy-app-id': env.MANDATE_PRIVY_APP_ID,
				'privy-request-expiry': capturedHeaders['privy-request-expiry']
			}
		};
		const jcsBytes = new TextEncoder().encode(canonicalizeJson(payload));
		const publicKey = await crypto.subtle.importKey(
			'spki',
			new Uint8Array(authPublicKey),
			{ name: 'ECDSA', namedCurve: 'P-256' },
			false,
			['verify']
		);
		const der = new Uint8Array(Buffer.from(authHeader!, 'base64'));
		const raw = p256.Signature.fromDER(der).toCompactRawBytes();
		expect(
			await crypto.subtle.verify(
				{ name: 'ECDSA', hash: 'SHA-256' },
				publicKey,
				new Uint8Array(raw),
				jcsBytes
			)
		).toBe(true);
	});
});
