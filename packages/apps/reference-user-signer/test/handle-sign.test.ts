import { secp256k1 } from '@noble/curves/secp256k1';
import {
	COSE_CRV,
	COSE_CRV_P256,
	COSE_KTY,
	COSE_KTY_EC2,
	COSE_X,
	COSE_Y,
	buildDelegationCertificateKs256WithSigner,
	encodeIntKeyCbor,
	verifyDelegationCertificateKs256
} from '@forestrie/delegation-cose';
import { describe, expect, it } from 'vitest';
import { handleSign } from '../src/handle-sign.js';
import type { Env } from '../src/env.js';
import {
	addressFromUncompressedPubkey,
	base64ToBytes,
	bytesToBase64,
	hashSigStructure,
	recoverAddressFromSignature
} from '../src/sig-utils.js';

const TEST_LOG_ID = 'b2c3d4e5f67890ab1234567890abcdef';
const USER_SIGNER_BEARER = 'user-signer-bearer-token';
const KEY_REF = 'user-remote';

function createEnv(privateKey: Uint8Array): Env {
	const pub = secp256k1.getPublicKey(privateKey, false);
	const rootSignerAddress = `0x${Buffer.from(addressFromUncompressedPubkey(pub)).toString('hex')}`;
	return {
		USER_SIGNER_BEARER,
		USER_SIGNER_KEYS_JSON: JSON.stringify({
			[TEST_LOG_ID]: {
				privateKeyHex: Buffer.from(privateKey).toString('hex'),
				rootSignerAddress,
				keyRef: KEY_REF
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
	return new Request('http://user-signer.test/v1/sign', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${opts.bearer ?? USER_SIGNER_BEARER}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			logId: opts.logId ?? TEST_LOG_ID,
			keyRef: opts.keyRef ?? KEY_REF,
			rootSignerAddress,
			sigStructure: bytesToBase64(sigStructure)
		})
	});
}

async function generateDelegatedPublicKeyCbor(): Promise<Uint8Array> {
	const keyPair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
		'sign',
		'verify'
	])) as CryptoKeyPair;
	const raw = new Uint8Array(
		(await crypto.subtle.exportKey('raw', keyPair.publicKey)) as ArrayBuffer
	);
	return encodeIntKeyCbor(
		new Map<number, unknown>([
			[COSE_KTY, COSE_KTY_EC2],
			[COSE_CRV, COSE_CRV_P256],
			[COSE_X, raw.slice(1, 33)],
			[COSE_Y, raw.slice(33, 65)]
		])
	);
}

describe('handleSign', () => {
	it('T-209-1: returns 65-byte signature recovering to rootSignerAddress', async () => {
		const privateKey = secp256k1.utils.randomPrivateKey();
		const env = createEnv(privateKey);
		const sigStructure = new Uint8Array([1, 2, 3, 4]);
		const response = await handleSign(signRequest({ privateKey, sigStructure }), { env });
		expect(response.status).toBe(200);
		const body = (await response.json()) as { signature: string };
		const signature = base64ToBytes(body.signature);
		expect(signature.length).toBe(65);
		const hash = hashSigStructure(sigStructure);
		const recovered = recoverAddressFromSignature(hash, signature);
		const pub = secp256k1.getPublicKey(privateKey, false);
		expect(recovered).toEqual(addressFromUncompressedPubkey(pub));
	});

	it('T-209-2: rejects bad bearer with 401', async () => {
		const privateKey = secp256k1.utils.randomPrivateKey();
		const env = createEnv(privateKey);
		const response = await handleSign(signRequest({ privateKey, bearer: 'wrong-token' }), {
			env
		});
		expect(response.status).toBe(401);
	});

	it('T-209-3: rejects wrong rootSignerAddress with 400', async () => {
		const privateKey = secp256k1.utils.randomPrivateKey();
		const env = createEnv(privateKey);
		const response = await handleSign(
			signRequest({ privateKey, rootSignerAddress: '0x' + 'ab'.repeat(20) }),
			{ env }
		);
		expect(response.status).toBe(400);
	});

	it('T-209-4: rejects unknown logId with 404', async () => {
		const privateKey = secp256k1.utils.randomPrivateKey();
		const env = createEnv(privateKey);
		const response = await handleSign(signRequest({ privateKey, logId: 'f'.repeat(32) }), {
			env
		});
		expect(response.status).toBe(404);
	});

	it('T-209-4b: rejects unknown keyRef with 404', async () => {
		const privateKey = secp256k1.utils.randomPrivateKey();
		const env = createEnv(privateKey);
		const response = await handleSign(signRequest({ privateKey, keyRef: 'missing-key' }), {
			env
		});
		expect(response.status).toBe(404);
	});

	it('T-209-5: assembles delegation certificate verifiable via delegation-cose', async () => {
		const privateKey = secp256k1.utils.randomPrivateKey();
		const env = createEnv(privateKey);
		const pub = secp256k1.getPublicKey(privateKey, false);
		const rootSignerAddressBytes = addressFromUncompressedPubkey(pub);
		const delegatedPublicKeyCbor = await generateDelegatedPublicKeyCbor();

		const certificate = await buildDelegationCertificateKs256WithSigner(
			{
				logIdHex32: TEST_LOG_ID,
				mmrStart: 1,
				mmrEnd: 8,
				delegatedPublicKeyCbor,
				ttlSeconds: 3600
			},
			rootSignerAddressBytes,
			async (sigStructureBytes) => {
				const response = await handleSign(
					signRequest({ privateKey, sigStructure: sigStructureBytes }),
					{ env }
				);
				expect(response.status).toBe(200);
				const body = (await response.json()) as { signature: string };
				return base64ToBytes(body.signature);
			}
		);

		expect(await verifyDelegationCertificateKs256(certificate, rootSignerAddressBytes)).toBe(true);
	});
});
