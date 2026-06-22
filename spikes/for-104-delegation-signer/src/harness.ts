import {
	buildDelegationCertificateKs256WithSigner,
	encodeIntKeyCbor,
	verifyDelegationCertificateKs256,
	COSE_CRV,
	COSE_CRV_P256,
	COSE_KTY,
	COSE_KTY_EC2,
	COSE_X,
	COSE_Y,
	type DelegationInput
} from '@forestrie/delegation-cose';
import { secp256k1 } from '@noble/curves/secp256k1';
import { keccak_256 } from '@noble/hashes/sha3';
import {
	addressFromPrivateKey,
	formatEthAddress,
	hashSigStructure,
	signRecoverableLowS
} from './sig-utils.js';

export type SignerBackend = (sigStructureBytes: Uint8Array) => Promise<Uint8Array>;

export interface TestRoot {
	privateKey: Uint8Array;
	privateKeyHex: string;
	rootSignerAddress: Uint8Array;
	rootSignerAddressHex: string;
}

export function generateTestRoot(): TestRoot {
	const privateKey = secp256k1.utils.randomPrivateKey();
	const rootSignerAddress = addressFromPrivateKey(privateKey);
	return {
		privateKey,
		privateKeyHex: Buffer.from(privateKey).toString('hex'),
		rootSignerAddress,
		rootSignerAddressHex: formatEthAddress(rootSignerAddress)
	};
}

export async function generateDelegatedPublicKeyCbor(): Promise<Uint8Array> {
	const keyPair = (await crypto.subtle.generateKey(
		{ name: 'ECDSA', namedCurve: 'P-256' },
		true,
		['sign', 'verify']
	)) as CryptoKeyPair;
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

export function sampleDelegationInput(delegatedPublicKeyCbor: Uint8Array): DelegationInput {
	return {
		logIdHex32: 'b2c3d4e5f67890ab1234567890abcdef12',
		mmrStart: 1,
		mmrEnd: 8,
		delegatedPublicKeyCbor,
		issuedAt: 1_700_000_100,
		expiresAt: 1_700_003_700,
		ttlSeconds: 3600
	};
}

/** Control backend: raw secp256k1 key signs keccak256(sigStructure). */
export function createLocalSecpBackend(privateKey: Uint8Array): SignerBackend {
	return async (sigStructureBytes) => {
		const hash = hashSigStructure(sigStructureBytes);
		return signRecoverableLowS(hash, privateKey);
	};
}

export interface VerifyBackendResult {
	ok: boolean;
	latencyMs: number;
	certificateBytes: number;
}

export async function verifyBackend(
	backend: SignerBackend,
	rootSignerAddress: Uint8Array,
	delegatedPublicKeyCbor: Uint8Array
): Promise<VerifyBackendResult> {
	const input = sampleDelegationInput(delegatedPublicKeyCbor);
	const started = performance.now();
	const certificate = await buildDelegationCertificateKs256WithSigner(
		input,
		rootSignerAddress,
		backend
	);
	const latencyMs = performance.now() - started;
	const ok = await verifyDelegationCertificateKs256(certificate, rootSignerAddress);
	return { ok, latencyMs, certificateBytes: certificate.length };
}

export function rootFromPrivateKeyHex(privateKeyHex: string): TestRoot {
	const privateKey = Uint8Array.from(Buffer.from(privateKeyHex.replace(/^0x/, ''), 'hex'));
	const rootSignerAddress = addressFromPrivateKey(privateKey);
	return {
		privateKey,
		privateKeyHex: Buffer.from(privateKey).toString('hex'),
		rootSignerAddress,
		rootSignerAddressHex: formatEthAddress(rootSignerAddress)
	};
}

/** Sanity: address derivation matches keccak(pub[1:]). */
export function assertAddressDerivation(root: TestRoot): void {
	const pub = secp256k1.getPublicKey(root.privateKey, false);
	const derived = keccak_256(pub.slice(1)).slice(-20);
	if (!derived.every((b, i) => b === root.rootSignerAddress[i])) {
		throw new Error('address derivation mismatch');
	}
}
