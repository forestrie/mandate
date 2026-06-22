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

export function parsePrivyRecoverableSignature(hex: string): Uint8Array {
	const stripped = hex.trim().replace(/^0x/i, '');
	const out = new Uint8Array(65);
	for (let i = 0; i < 65; i++) {
		out[i] = parseInt(stripped.slice(i * 2, i * 2 + 2), 16);
	}
	if (out[64]! >= 27) out[64] = out[64]! - 27;
	return out;
}

export function recoverAddressFromSignature(
	hash: Uint8Array,
	signature: Uint8Array
): Uint8Array {
	const recovery = signature[64]!;
	const compact = signature.slice(0, 64);
	const sig = secp256k1.Signature.fromCompact(compact).addRecoveryBit(recovery);
	const recovered = sig.recoverPublicKey(hash);
	return addressFromUncompressedPubkey(recovered.toRawBytes(false));
}
