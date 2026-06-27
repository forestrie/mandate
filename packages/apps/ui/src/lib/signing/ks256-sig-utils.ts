import { keccak_256 } from '@noble/hashes/sha3';
import { secp256k1 } from '@noble/curves/secp256k1';

export const KS256_SIG_BYTES = 65;

export function hashSigStructure(sigStructureBytes: Uint8Array): Uint8Array {
	return keccak_256(sigStructureBytes);
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

/** Privy returns 0x-prefixed 65-byte hex; v is often 27/28. */
export function normalizePrivyKs256Signature(hex: string): Uint8Array {
	const stripped = hex.trim().replace(/^0x/i, '');
	if (stripped.length !== KS256_SIG_BYTES * 2) {
		throw new Error(`Privy signature must be ${KS256_SIG_BYTES} bytes`);
	}
	const out = new Uint8Array(KS256_SIG_BYTES);
	for (let i = 0; i < KS256_SIG_BYTES; i++) {
		out[i] = parseInt(stripped.slice(i * 2, i * 2 + 2), 16);
	}
	if (out[64]! >= 27) out[64] = out[64]! - 27;
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
