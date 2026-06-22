import { secp256k1 } from '@noble/curves/secp256k1';
import { keccak_256 } from '@noble/hashes/sha3';

export const KS256_SIG_BYTES = 65;

export function hashSigStructure(sigStructureBytes: Uint8Array): Uint8Array {
	return keccak_256(sigStructureBytes);
}

export function addressFromUncompressedPubkey(uncompressed: Uint8Array): Uint8Array {
	return keccak_256(uncompressed.slice(1)).slice(-20);
}

export function addressFromPrivateKey(privateKey: Uint8Array): Uint8Array {
	const pub = secp256k1.getPublicKey(privateKey, false);
	return addressFromUncompressedPubkey(pub);
}

export function formatEthAddress(address: Uint8Array): string {
	return `0x${Buffer.from(address).toString('hex')}`;
}

/** Build 65-byte recoverable signature (recovery bit 0–3, not 27/28). */
export function signRecoverableLowS(hash: Uint8Array, privateKey: Uint8Array): Uint8Array {
	const sigObj = secp256k1.sign(hash, privateKey, { lowS: true });
	const out = new Uint8Array(KS256_SIG_BYTES);
	out.set(sigObj.toCompactRawBytes(), 0);
	out[64] = sigObj.recovery ?? 0;
	return out;
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
	return out;
}

/** Convert KMS DER ECDSA signature to 65-byte recoverable, matching expectedAddress. */
export function derToRecoverableSignature(
	der: Uint8Array,
	hash: Uint8Array,
	expectedAddress: Uint8Array
): Uint8Array {
	const sig = secp256k1.Signature.fromDER(der);
	const normalized = sig.normalizeS();
	const compact = normalized.toCompactRawBytes();
	for (const recovery of [0, 1, 2, 3] as const) {
		try {
			const recovered = normalized.addRecoveryBit(recovery).recoverPublicKey(hash);
			const address = addressFromUncompressedPubkey(recovered.toRawBytes(false));
			if (bytesEqual(address, expectedAddress)) {
				const out = new Uint8Array(KS256_SIG_BYTES);
				out.set(compact, 0);
				out[64] = recovery;
				return out;
			}
		} catch {
			// try next recovery bit
		}
	}
	throw new Error('could not recover v matching expected KMS address');
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) {
		if (a[i] !== b[i]) return false;
	}
	return true;
}

export function signToDer(hash: Uint8Array, privateKey: Uint8Array): Uint8Array {
	const sigObj = secp256k1.sign(hash, privateKey, { lowS: true });
	return sigObj.toDERRawBytes();
}

export function bytesToBase64(bytes: Uint8Array): string {
	return Buffer.from(bytes).toString('base64');
}

export function base64ToBytes(base64: string): Uint8Array {
	return new Uint8Array(Buffer.from(base64, 'base64'));
}
