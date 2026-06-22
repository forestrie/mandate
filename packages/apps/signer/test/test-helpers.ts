import { keccak_256 } from '@noble/hashes/sha3';
import { secp256k1 } from '@noble/curves/secp256k1';

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

export function signRecoverableLowS(hash: Uint8Array, privateKey: Uint8Array): Uint8Array {
	const sigObj = secp256k1.sign(hash, privateKey, { lowS: true });
	const out = new Uint8Array(65);
	out.set(sigObj.toCompactRawBytes(), 0);
	out[64] = sigObj.recovery ?? 0;
	return out;
}

export function bytesToBigIntBE(bytes: Uint8Array): bigint {
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

/** Force a high-s (non-canonical) recoverable signature for malleability tests. */
export function signRecoverableHighS(hash: Uint8Array, privateKey: Uint8Array): Uint8Array {
	const sigObj = secp256k1.sign(hash, privateKey, { lowS: false });
	const n = secp256k1.CURVE.n;
	let s = sigObj.s;
	let recovery = sigObj.recovery ?? 0;
	if (s <= n >> 1n) {
		s = n - s;
		recovery ^= 1;
	}
	const out = new Uint8Array(65);
	writeBigIntBE(sigObj.r, out, 0, 32);
	writeBigIntBE(s, out, 32, 32);
	out[64] = recovery;
	return out;
}

export function parsePrivyRecoverableSignature(hex: string): Uint8Array {
	const stripped = hex.trim().replace(/^0x/i, '');
	const out = new Uint8Array(65);
	for (let i = 0; i < 65; i++) {
		out[i] = parseInt(stripped.slice(i * 2, i * 2 + 2), 16);
	}
	if (out[64]! >= 27) out[64] = out[64]! - 27;
	return out;
}

export function recoverAddressFromSignature(hash: Uint8Array, signature: Uint8Array): Uint8Array {
	const recovery = signature[64]!;
	const compact = signature.slice(0, 64);
	const sig = secp256k1.Signature.fromCompact(compact).addRecoveryBit(recovery);
	const recovered = sig.recoverPublicKey(hash);
	return addressFromUncompressedPubkey(recovered.toRawBytes(false));
}
