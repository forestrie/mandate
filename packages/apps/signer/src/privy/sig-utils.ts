import { keccak_256 } from '@noble/hashes/sha3';
import { secp256k1 } from '@noble/curves/secp256k1';

export const KS256_SIG_BYTES = 65;

export function bytesToBase64(bytes: Uint8Array): string {
	return Buffer.from(bytes).toString('base64');
}

export function base64ToBytes(base64: string): Uint8Array {
	return new Uint8Array(Buffer.from(base64, 'base64'));
}

export function hashSigStructure(sigStructureBytes: Uint8Array): Uint8Array {
	return keccak_256(sigStructureBytes);
}

export function addressFromUncompressedPubkey(uncompressed: Uint8Array): Uint8Array {
	return keccak_256(uncompressed.slice(1)).slice(-20);
}

export function parseEthAddress(address: string): Uint8Array {
	const hex = address.trim().replace(/^0x/i, '');
	if (!/^[0-9a-fA-F]{40}$/.test(hex)) {
		throw new Error('rootSignerAddress must be 20-byte 0x hex');
	}
	const out = new Uint8Array(20);
	for (let i = 0; i < 20; i++) {
		out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
	}
	return out;
}

export function formatEthAddress(address: Uint8Array): string {
	return `0x${Buffer.from(address).toString('hex')}`;
}

/** Privy returns 0x-prefixed 65-byte hex; v is often 27/28. */
export function parsePrivyRecoverableSignature(hex: string): Uint8Array {
	const stripped = hex.trim().replace(/^0x/i, '');
	if (stripped.length !== KS256_SIG_BYTES * 2) {
		throw new Error(`Privy signature must be ${KS256_SIG_BYTES} bytes`);
	}
	const out = new Uint8Array(KS256_SIG_BYTES);
	for (let i = 0; i < KS256_SIG_BYTES; i++) {
		out[i] = parseInt(stripped.slice(i * 2, i * 2 + 2), 16);
	}
	if (out[64]! >= 27) out[64] = out[64]! - 27;
	// Normalize to low-s. Privy is not guaranteed to canonicalize s, but the rest
	// of the system (canopy local signer) signs low-s; matching avoids signature
	// malleability and stays robust to verifiers that reject (r, n - s).
	const n = secp256k1.CURVE.n;
	const s = bytesToBigIntBE(out.subarray(32, 64));
	if (s > n >> 1n) {
		writeBigIntBE(n - s, out, 32, 32);
		out[64] = out[64]! ^ 1;
	}
	return out;
}

function bytesToBigIntBE(bytes: Uint8Array): bigint {
	let value = 0n;
	for (const byte of bytes) value = (value << 8n) | BigInt(byte);
	return value;
}

function writeBigIntBE(value: bigint, out: Uint8Array, offset: number, length: number): void {
	let v = value;
	for (let i = length - 1; i >= 0; i--) {
		out[offset + i] = Number(v & 0xffn);
		v >>= 8n;
	}
}

export function recoverAddressFromSignature(hash: Uint8Array, signature: Uint8Array): Uint8Array {
	const recovery = signature[64]!;
	const compact = signature.slice(0, 64);
	const sig = secp256k1.Signature.fromCompact(compact).addRecoveryBit(recovery);
	const recovered = sig.recoverPublicKey(hash);
	return addressFromUncompressedPubkey(recovered.toRawBytes(false));
}

export function addressesEqual(a: Uint8Array, b: Uint8Array): boolean {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) {
		if (a[i] !== b[i]) return false;
	}
	return true;
}
