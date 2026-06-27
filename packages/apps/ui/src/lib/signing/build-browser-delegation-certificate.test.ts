import { describe, expect, it } from 'vitest';
import {
	buildDelegationCertificateKs256,
	verifyDelegationCertificateKs256,
	encodeIntKeyCbor,
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
import type { Hex } from 'viem';
import { buildBrowserDelegationCertificate } from './build-browser-delegation-certificate.js';
import type { SigningBackend } from './signing-backend.js';
import { bytesToBase64 } from './bytes.js';

const TEST_PRIVATE_KEY_HEX =
	'0000000000000000000000000000000000000000000000000000000000000001';

function testRootFromPrivateKey(privateKeyHex: string) {
	const sk = Uint8Array.from(Buffer.from(privateKeyHex, 'hex'));
	const pub = secp256k1.getPublicKey(sk, false);
	const rootSignerAddressBytes = keccak_256(pub.slice(1)).slice(-20);
	const rootSignerAddress = `0x${Buffer.from(rootSignerAddressBytes).toString('hex')}`;
	return { sk, rootSignerAddress, rootSignerAddressBytes };
}

async function generateDelegatedPublicKeyCbor(): Promise<Uint8Array> {
	const keyPair = await crypto.subtle.generateKey(
		{ name: 'ECDSA', namedCurve: 'P-256' },
		true,
		['sign', 'verify']
	);
	const raw = new Uint8Array(await crypto.subtle.exportKey('raw', keyPair.publicKey));
	return encodeIntKeyCbor(
		new Map<number, unknown>([
			[COSE_KTY, COSE_KTY_EC2],
			[COSE_CRV, COSE_CRV_P256],
			[COSE_X, raw.slice(1, 33)],
			[COSE_Y, raw.slice(33, 65)]
		])
	);
}

class LocalKs256Backend implements SigningBackend {
	readonly kind = 'eoa' as const;

	constructor(private readonly sk: Uint8Array) {}

	isAvailable(): boolean {
		return true;
	}

	async signKs256SigStructure(sigStructureBytes: Uint8Array): Promise<Hex> {
		const hash = keccak_256(sigStructureBytes);
		const sig = secp256k1.sign(hash, this.sk, { lowS: true });
		const compact = sig.toCompactRawBytes();
		const out = new Uint8Array(65);
		out.set(compact, 0);
		out[64] = sig.recovery ?? 0;
		return `0x${Buffer.from(out).toString('hex')}` as Hex;
	}
}

describe('buildBrowserDelegationCertificate', () => {
	it('assembles a certificate that verifies with verifyDelegationCertificateKs256', async () => {
		const root = testRootFromPrivateKey(TEST_PRIVATE_KEY_HEX);
		const delegatedPublicKeyCbor = await generateDelegatedPublicKeyCbor();
		const issuedAt = 1_700_000_100;
		const input: DelegationInput = {
			logIdHex32: 'b2c3d4e5f67890ab1234567890abcdef12',
			mmrStart: 1,
			mmrEnd: 100,
			delegatedPublicKeyCbor,
			issuedAt,
			expiresAt: issuedAt + 3600,
			delegationId: new Uint8Array(16).fill(0xcd),
			ttlSeconds: 3600
		};

		const certificate = await buildBrowserDelegationCertificate(
			input,
			root.rootSignerAddress,
			new LocalKs256Backend(root.sk)
		);

		await expect(
			verifyDelegationCertificateKs256(certificate, root.rootSignerAddressBytes)
		).resolves.toBe(true);
	});

	it('matches agent local-ks256-signer certificate bytes for fixed inputs', async () => {
		const root = testRootFromPrivateKey(TEST_PRIVATE_KEY_HEX);
		const delegatedPublicKeyCbor = await generateDelegatedPublicKeyCbor();
		const issuedAt = 1_700_000_200;
		const input: DelegationInput = {
			logIdHex32: 'c3d4e5f67890ab1234567890abcdef1234',
			mmrStart: 0,
			mmrEnd: 10,
			delegatedPublicKeyCbor,
			issuedAt,
			expiresAt: issuedAt + 3600,
			delegationId: new Uint8Array(16).fill(0xab),
			ttlSeconds: 3600
		};

		const agentStyle = await buildDelegationCertificateKs256(
			input,
			root.rootSignerAddressBytes,
			TEST_PRIVATE_KEY_HEX
		);
		const browserStyle = await buildBrowserDelegationCertificate(
			input,
			root.rootSignerAddress,
			new LocalKs256Backend(root.sk)
		);

		expect(bytesToBase64(browserStyle)).toBe(bytesToBase64(agentStyle));
	});
});
