import { describe, expect, it } from 'vitest';
import {
	concatHex,
	encodeAbiParameters,
	hashTypedData,
	keccak256,
	recoverAddress,
	toHex,
	type Hex,
	type TypedDataDefinition
} from 'viem';
import { secp256k1 } from '@noble/curves/secp256k1';
import { keccak_256 } from '@noble/hashes/sha3';
import {
	SafeBackend,
	buildSafeMessageTypedDataJson,
	safeOwnerSignatureBytes,
	type SafeSigningContext
} from './safe-backend.js';

const SAFE_ADDRESS = '0xCdD289cC5420529d1C4D0498FA3DaAb549A07a63';
const CHAIN_ID = 84532;

// Vendored from safe-contracts (Safe >= 1.3.0): the typehash constants the
// deployed Safe hashes against. If our type strings drift from these, the
// wallet-signed digest will not be the digest the Safe recomputes inside
// `isValidSignature` — the classic 1271 footgun this file pins shut.
const DOMAIN_SEPARATOR_TYPEHASH =
	'0x47e79534a245952e8b16893a336b85a3d9ea9fa8c573f3d803afb92a79469218';
const SAFE_MSG_TYPEHASH = '0x60b3cbf8b4a223d68d641b3b6ddf9a298e7f33710cf3d3a9d1146b5a6150fbca';

/** The Safe contract's digest, built by hand from the vendored typehashes. */
function safeMessageDigest(hash: Hex): Hex {
	const domainSeparator = keccak256(
		encodeAbiParameters(
			[{ type: 'bytes32' }, { type: 'uint256' }, { type: 'address' }],
			[DOMAIN_SEPARATOR_TYPEHASH, BigInt(CHAIN_ID), SAFE_ADDRESS]
		)
	);
	const structHash = keccak256(
		encodeAbiParameters(
			[{ type: 'bytes32' }, { type: 'bytes32' }],
			[SAFE_MSG_TYPEHASH, keccak256(hash)]
		)
	);
	return keccak256(concatHex(['0x1901', domainSeparator, structHash]));
}

describe('buildSafeMessageTypedDataJson', () => {
	it('uses the exact Safe type strings the vendored typehashes commit to', () => {
		expect(keccak256(toHex('EIP712Domain(uint256 chainId,address verifyingContract)'))).toBe(
			DOMAIN_SEPARATOR_TYPEHASH
		);
		expect(keccak256(toHex('SafeMessage(bytes message)'))).toBe(SAFE_MSG_TYPEHASH);
	});

	it('hashes to the digest the Safe recomputes inside isValidSignature', () => {
		const hash = keccak256(toHex('some KS256 Sig_structure'));
		const typedData = JSON.parse(
			buildSafeMessageTypedDataJson(hash, CHAIN_ID, SAFE_ADDRESS)
		) as TypedDataDefinition;
		expect(hashTypedData(typedData)).toBe(safeMessageDigest(hash));
	});
});

describe('safeOwnerSignatureBytes', () => {
	it('keeps a 27/28-flavoured signature byte-for-byte', () => {
		const hex = `0x${'11'.repeat(32)}${'22'.repeat(32)}1b`;
		const out = safeOwnerSignatureBytes(hex);
		expect(out).toHaveLength(65);
		expect(out[64]).toBe(27);
		expect(out[0]).toBe(0x11);
		expect(out[63]).toBe(0x22);
	});

	it('lifts a 0/1 recovery id to the 27/28 flavour Safe demands', () => {
		expect(safeOwnerSignatureBytes(`0x${'11'.repeat(64)}01`)[64]).toBe(28);
	});

	it('refuses out-of-range v and wrong lengths loudly', () => {
		expect(() => safeOwnerSignatureBytes(`0x${'11'.repeat(64)}1d`)).toThrow(/v must be 27 or 28/);
		expect(() => safeOwnerSignatureBytes(`0x${'11'.repeat(64)}`)).toThrow(/65 bytes/);
		// v += 4 (eth_sign flavour) must never slip through for typed-data sigs.
		expect(() => safeOwnerSignatureBytes(`0x${'11'.repeat(64)}1f`)).toThrow(/v must be 27 or 28/);
	});
});

describe('SafeBackend', () => {
	const ownerKey = new Uint8Array(32).fill(7);
	const ownerAddress = (() => {
		const pub = secp256k1.getPublicKey(ownerKey, false);
		return `0x${Buffer.from(keccak_256(pub.slice(1)).slice(-20)).toString('hex')}`;
	})();

	function walletSigningSafeMessages(): SafeSigningContext {
		// A MetaMask-shaped wallet: answers eth_signTypedData_v4 by EIP-712
		// hashing the payload and signing with the owner key (v as 27/28).
		return {
			ownerAddress,
			safeAddress: SAFE_ADDRESS,
			chainId: CHAIN_ID,
			provider: {
				async request({ method, params }) {
					expect(method).toBe('eth_signTypedData_v4');
					const [from, json] = params as [string, string];
					expect(from).toBe(ownerAddress);
					const digest = hashTypedData(JSON.parse(json) as TypedDataDefinition);
					const digestBytes = Uint8Array.from(Buffer.from(digest.slice(2), 'hex'));
					const sig = secp256k1.sign(digestBytes, ownerKey, { lowS: true });
					const out = new Uint8Array(65);
					out.set(sig.toCompactRawBytes(), 0);
					out[64] = 27 + sig.recovery;
					return `0x${Buffer.from(out).toString('hex')}`;
				}
			}
		};
	}

	it('signs the SafeMessage digest so the blob ecrecovers to the owner', async () => {
		const backend = new SafeBackend(async () => walletSigningSafeMessages());
		const sigStructure = new TextEncoder().encode('Sig_structure bytes');
		const blob = await backend.signKs256SigStructure(sigStructure);

		expect(blob).toHaveLength(65);
		expect([27, 28]).toContain(blob[64]);

		// What the Safe does inside isValidSignature(hash, blob): recompute the
		// SafeMessage digest for `hash` and ecrecover the owner from the blob.
		const hash = keccak256(sigStructure);
		const recovered = await recoverAddress({
			hash: safeMessageDigest(hash),
			signature: `0x${Buffer.from(blob).toString('hex')}`
		});
		expect(recovered.toLowerCase()).toBe(ownerAddress);
	});
});
