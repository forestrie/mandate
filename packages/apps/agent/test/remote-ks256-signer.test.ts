import { secp256k1 } from '@noble/curves/secp256k1';
import { describe, expect, it, vi } from 'vitest';
import type { SignRequest } from '@mandate/signer-contract';
import { RemoteKs256Signer } from '../src/signer/remote-ks256-signer.js';
import { base64ToBytes } from '../src/bytes.js';
import {
	generateDelegatedPublicKeyCbor,
	generateTestKs256Root,
	TEST_LOG_ID
} from './test-helpers.js';
import { keccak_256 } from '@noble/hashes/sha3';

function signRecoverableLowS(hash: Uint8Array, privateKey: Uint8Array): Uint8Array {
	const sigObj = secp256k1.sign(hash, privateKey, { lowS: true });
	const out = new Uint8Array(65);
	out.set(sigObj.toCompactRawBytes(), 0);
	out[64] = sigObj.recovery ?? 0;
	return out;
}

describe('RemoteKs256Signer', () => {
	it('POSTs ADR-0003 SignRequest with bearer auth', async () => {
		const root = await generateTestKs256Root();
		const delegatedPublicKeyCbor = await generateDelegatedPublicKeyCbor();
		let capturedInit: RequestInit | undefined;

		const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
			capturedInit = init;
			const body = JSON.parse(String(init?.body)) as SignRequest;
			const sigStructure = base64ToBytes(body.sigStructure);
			const hash = keccak_256(sigStructure);
			const privateKey = Uint8Array.from(Buffer.from(root.privateKeyHex, 'hex'));
			const signature = signRecoverableLowS(hash, privateKey);
			return new Response(
				JSON.stringify({
					signature: Buffer.from(signature).toString('base64')
				}),
				{ status: 200 }
			);
		});

		const signer = new RemoteKs256Signer(
			{
				alg: 'KS256',
				rootSignerAddress: root.rootSignerAddress,
				kind: 'remote',
				signerUrl: 'https://signer.example/v1/sign',
				keyRef: 'test-key-ref'
			},
			'bearer-token-123',
			fetchImpl
		);

		await signer.buildCertificate({
			logIdHex32: TEST_LOG_ID,
			mmrStart: 1,
			mmrEnd: 2,
			delegatedPublicKeyCbor,
			ttlSeconds: 3600
		});

		expect(capturedInit?.method).toBe('POST');
		const headers = capturedInit?.headers as Record<string, string>;
		expect(headers.Authorization).toBe('Bearer bearer-token-123');
		const body = JSON.parse(String(capturedInit?.body)) as SignRequest;
		expect(body.logId).toBe(TEST_LOG_ID);
		expect(body.keyRef).toBe('test-key-ref');
		expect(body.rootSignerAddress).toBe(root.rootSignerAddress);
		expect(body.sigStructure.length).toBeGreaterThan(0);
	});

	it('uses bearerEnvKey env value instead of mandate token', async () => {
		const root = await generateTestKs256Root();
		const delegatedPublicKeyCbor = await generateDelegatedPublicKeyCbor();
		let capturedInit: RequestInit | undefined;

		const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
			capturedInit = init;
			const body = JSON.parse(String(init?.body)) as SignRequest;
			const sigStructure = base64ToBytes(body.sigStructure);
			const hash = keccak_256(sigStructure);
			const privateKey = Uint8Array.from(Buffer.from(root.privateKeyHex, 'hex'));
			const signature = signRecoverableLowS(hash, privateKey);
			return new Response(
				JSON.stringify({
					signature: Buffer.from(signature).toString('base64')
				}),
				{ status: 200 }
			);
		});

		const signer = new RemoteKs256Signer(
			{
				alg: 'KS256',
				rootSignerAddress: root.rootSignerAddress,
				kind: 'remote',
				signerUrl: 'https://user-signer.example/v1/sign',
				keyRef: 'user-key-ref',
				bearerEnvKey: 'USER_SIGNER_BEARER'
			},
			'mandate-token-should-not-be-used',
			fetchImpl,
			{ USER_SIGNER_BEARER: 'user-bearer-token' }
		);

		await signer.buildCertificate({
			logIdHex32: TEST_LOG_ID,
			mmrStart: 1,
			mmrEnd: 2,
			delegatedPublicKeyCbor,
			ttlSeconds: 3600
		});

		const headers = capturedInit?.headers as Record<string, string>;
		expect(headers.Authorization).toBe('Bearer user-bearer-token');
	});

	it('fails closed when bearerEnvKey is set but env value is empty', () => {
		expect(() =>
			new RemoteKs256Signer(
				{
					alg: 'KS256',
					rootSignerAddress: '0x0000000000000000000000000000000000000001',
					kind: 'remote',
					signerUrl: 'https://user-signer.example/v1/sign',
					keyRef: 'user-key-ref',
					bearerEnvKey: 'USER_SIGNER_BEARER'
				},
				'mandate-token',
				undefined,
				{}
			)
		).toThrow('remote bearer env USER_SIGNER_BEARER is required but empty');
	});
});
