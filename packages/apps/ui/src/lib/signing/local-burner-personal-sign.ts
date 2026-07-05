import { secp256k1 } from '@noble/curves/secp256k1';
import { bytesToHex, hashMessage, hexToBytes, type Hex } from 'viem';
import { loadBurnerKeyHex } from './local-burner-key.js';

/**
 * EIP-191 `personal_sign` with the browser-local burner key (plan-2607-01, FOR-322).
 * The delegation console authenticates its coordinator control-plane session by
 * signing a challenge; in burner mode that signature comes from the burner key
 * rather than the Privy wallet, so the whole console works with no Privy.
 * Returns 0x r‖s‖v with v ∈ {27,28} to match wallet `personal_sign` output.
 */
export function signBurnerPersonalMessage(message: string): Hex {
	const keyHex = loadBurnerKeyHex();
	if (!keyHex) {
		throw new Error('Create a burner wallet before signing the control-plane challenge.');
	}
	const digest = hexToBytes(hashMessage(message));
	const sig = secp256k1.sign(digest, hexToBytes(keyHex), { lowS: true });
	if (sig.recovery !== 0 && sig.recovery !== 1) {
		throw new Error(`unexpected secp256k1 recovery id: ${sig.recovery}`);
	}
	const out = new Uint8Array(65);
	out.set(sig.toCompactRawBytes(), 0);
	out[64] = sig.recovery + 27;
	return bytesToHex(out);
}
