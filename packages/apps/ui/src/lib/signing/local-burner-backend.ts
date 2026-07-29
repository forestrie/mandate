import { keccak_256 } from '@noble/hashes/sha3';
import { secp256k1 } from '@noble/curves/secp256k1';
import { hexToBytes } from 'viem';
import type { SigningBackend } from './signing-backend.js';
import { SigningBackendUnavailableError } from './signing-backend.js';
import { KS256_SIG_BYTES } from './ks256-sig-utils.js';
import { hasBurnerKey, loadBurnerKeyHex } from './local-burner-key.js';

/**
 * Demo/system-test signing backend (plan-2607-01, FOR-322): signs KS256
 * delegation certificates with a browser-local burner key the user fully
 * controls, instead of the custodial Privy embedded wallet. Emits the 65-byte
 * recoverable wire signature directly — recovery id already in [0,1], low-S.
 * See `local-burner-key.ts` for the (deliberately weak) custody model.
 */
export class LocalBurnerBackend implements SigningBackend {
	readonly kind = 'eoa' as const;

	isAvailable(): boolean {
		return hasBurnerKey();
	}

	async signKs256SigStructure(sigStructureBytes: Uint8Array): Promise<Uint8Array> {
		const keyHex = loadBurnerKeyHex();
		if (!keyHex) {
			throw new SigningBackendUnavailableError('Create a burner wallet before signing.');
		}
		const hash = keccak_256(sigStructureBytes);
		const sig = secp256k1.sign(hash, hexToBytes(keyHex), { lowS: true });
		if (sig.recovery !== 0 && sig.recovery !== 1) {
			throw new Error(`unexpected secp256k1 recovery id: ${sig.recovery}`);
		}
		const out = new Uint8Array(KS256_SIG_BYTES);
		out.set(sig.toCompactRawBytes(), 0);
		out[64] = sig.recovery;
		return out;
	}
}
