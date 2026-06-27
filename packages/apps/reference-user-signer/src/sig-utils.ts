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

export function signRecoverableLowS(hash: Uint8Array, privateKeyHex: string): Uint8Array {
	const privateKey = Uint8Array.from(Buffer.from(privateKeyHex.replace(/^0x/i, ''), 'hex'));
	const sigObj = secp256k1.sign(hash, privateKey, { lowS: true });
	const out = new Uint8Array(KS256_SIG_BYTES);
	out.set(sigObj.toCompactRawBytes(), 0);
	out[64] = sigObj.recovery ?? 0;
	return out;
}

export function addressFromUncompressedPubkey(uncompressed: Uint8Array): Uint8Array {
	return keccak_256(uncompressed.slice(1)).slice(-20);
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
