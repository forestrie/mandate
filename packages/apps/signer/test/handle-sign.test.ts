import { secp256k1 } from '@noble/curves/secp256k1';
import { describe, expect, it, vi } from 'vitest';
import { handleSign } from '../src/handle-sign.js';
import type { Env } from '../src/env.js';
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

const TEST_LOG_ID = 'b2c3d4e5f67890ab1234567890abcdef12';
const SIGNER_TOKEN = 'test-signer-token';

function createEnv(opts: { privateKey: Uint8Array; keyRef?: string; logIds?: string[] }): Env {
	const pub = secp256k1.getPublicKey(opts.privateKey, false);
	const rootSignerAddress = `0x${Buffer.from(addressFromUncompressedPubkey(pub)).toString('hex')}`;
	const keyRef = opts.keyRef ?? 'test-key';
	return {
		MANDATE_SIGNER_TOKEN: SIGNER_TOKEN,
		PRIVY_APP_ID: 'app-id',
		PRIVY_APP_SECRET: 'app-secret',
		KEY_DIRECTORY: JSON.stringify({
			[keyRef]: {
				walletId: 'wallet-1',
				rootSignerAddress,
				logIds: opts.logIds ?? [TEST_LOG_ID]
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

	it('fails closed when PRIVY_AUTHORIZATION_KEY is set (owned wallets unsupported)', async () => {
		const privateKey = secp256k1.utils.randomPrivateKey();
		const env: Env = {
			...createEnv({ privateKey }),
			PRIVY_AUTHORIZATION_KEY: 'wallet-auth:placeholder'
		};
		const sigStructure = new Uint8Array([1, 2, 3, 4]);
		await expect(
			handleSign(signRequest({ privateKey, sigStructure }), {
				env,
				fetchImpl: mockPrivyFetch(privateKey, sigStructure)
			})
		).rejects.toThrow(/owned-wallet authorization/i);
	});
});
