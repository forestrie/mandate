import { describe, expect, it } from 'vitest';
import { secp256k1 } from '@noble/curves/secp256k1';
import {
	assertAddressDerivation,
	createLocalSecpBackend,
	generateDelegatedPublicKeyCbor,
	generateTestRoot,
	verifyBackend
} from '../src/harness.js';
import { createGcpKmsBackendFromEnv } from '../src/gcp-kms-backend.js';
import { createPrivyBackendFromEnv, createPrivyLiveBackend } from '../src/privy-backend.js';
import {
	derToRecoverableSignature,
	hashSigStructure,
	parsePrivyRecoverableSignature,
	signRecoverableLowS,
	signToDer
} from '../src/sig-utils.js';

describe('FOR-104 spike harness', () => {
	it('local control backend passes verify gate', async () => {
		const root = generateTestRoot();
		const delegated = await generateDelegatedPublicKeyCbor();
		const result = await verifyBackend(
			createLocalSecpBackend(root.privateKey),
			root.rootSignerAddress,
			delegated
		);
		expect(result.ok).toBe(true);
	});

	it('privy mock backend passes verify gate', async () => {
		const root = generateTestRoot();
		const delegated = await generateDelegatedPublicKeyCbor();
		const { backend, mode } = createPrivyBackendFromEnv(root.privateKey);
		expect(mode).toBe('mock');
		const result = await verifyBackend(backend, root.rootSignerAddress, delegated);
		expect(result.ok).toBe(true);
	});

	it('gcp kms mock backend passes verify gate', async () => {
		const root = generateTestRoot();
		const delegated = await generateDelegatedPublicKeyCbor();
		const { backend, mode } = createGcpKmsBackendFromEnv(root.privateKey, root.rootSignerAddress);
		expect(mode).toBe('mock');
		const result = await verifyBackend(backend, root.rootSignerAddress, delegated);
		expect(result.ok).toBe(true);
	});

	it('parses Privy v=27/28 signatures', () => {
		const sk = secp256k1.utils.randomPrivateKey();
		const hash = new Uint8Array(32).fill(0xab);
		const sig = signRecoverableLowS(hash, sk);
		sig[64] = 27 + (sig[64] ?? 0);
		const hex = `0x${Buffer.from(sig).toString('hex')}`;
		const parsed = parsePrivyRecoverableSignature(hex);
		expect(parsed[64]).toBeLessThan(4);
	});

	it('derToRecoverableSignature recovers expected address', () => {
		const root = generateTestRoot();
		const hash = hashSigStructure(new Uint8Array([1, 2, 3, 4]));
		const der = signToDer(hash, root.privateKey);
		const recoverable = derToRecoverableSignature(der, hash, root.rootSignerAddress);
		expect(recoverable).toHaveLength(65);
	});

	it('privy live backend calls RPC when fetch mocked', async () => {
		const root = generateTestRoot();
		const hash = hashSigStructure(new Uint8Array([9, 8, 7]));
		const expectedSig = signRecoverableLowS(hash, root.privateKey);
		const privyHex = `0x${Buffer.from(
			(() => {
				const s = new Uint8Array(expectedSig);
				s[64] = s[64]! + 27;
				return s;
			})()
		).toString('hex')}`;

		const fetchImpl = async () =>
			new Response(JSON.stringify({ data: { signature: privyHex } }), { status: 200 });

		const backend = createPrivyLiveBackend({
			appId: 'app',
			appSecret: 'secret',
			walletId: 'wallet',
			fetchImpl: fetchImpl as typeof fetch
		});
		const sig = await backend(new Uint8Array([9, 8, 7]));
		expect(sig).toHaveLength(65);
	});

	it('address derivation is consistent', () => {
		const root = generateTestRoot();
		expect(() => assertAddressDerivation(root)).not.toThrow();
	});
});
