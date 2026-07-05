import { browser } from '$app/environment';
import { secp256k1 } from '@noble/curves/secp256k1';
import { keccak_256 } from '@noble/hashes/sha3';
import { bytesToHex, hexToBytes, type Hex } from 'viem';

/**
 * Browser-local burner key store for the demo/system-test signing backend
 * (plan-2607-01, FOR-322). The private key lives **unencrypted** in
 * `localStorage` — this is deliberately weak custody, acceptable only because
 * mandate is a forkable demo and the key is fully under the user's control
 * (own-your-keys / zero-friction-exit demonstration). Never use for the live
 * `mandate-forestrie` instance; Privy stays the production default.
 */
export const BURNER_KEY_STORAGE_KEY = 'mandate.burner.privateKey';

function normalizePrivateKeyHex(input: string): Hex {
	const stripped = input.trim().replace(/^0x/i, '');
	if (!/^[0-9a-fA-F]{64}$/.test(stripped)) {
		throw new Error('burner private key must be a 32-byte 0x hex string');
	}
	const bytes = hexToBytes(`0x${stripped}`);
	if (!secp256k1.utils.isValidPrivateKey(bytes)) {
		throw new Error('burner private key is not a valid secp256k1 scalar');
	}
	return `0x${stripped.toLowerCase()}`;
}

/** Read the stored burner key, or `null` if absent / not in the browser. */
export function loadBurnerKeyHex(): Hex | null {
	if (!browser) return null;
	const raw = window.localStorage.getItem(BURNER_KEY_STORAGE_KEY);
	if (!raw) return null;
	try {
		return normalizePrivateKeyHex(raw);
	} catch {
		return null;
	}
}

export function hasBurnerKey(): boolean {
	return loadBurnerKeyHex() !== null;
}

/** Generate a fresh burner key, persist it, and return the hex. */
export function createBurnerKey(): Hex {
	if (!browser) throw new Error('burner key store is browser-only');
	const hex = bytesToHex(secp256k1.utils.randomPrivateKey());
	window.localStorage.setItem(BURNER_KEY_STORAGE_KEY, hex);
	return hex;
}

/** Import an existing key (paste / deploy-seed) after validation, and persist it. */
export function importBurnerKey(privateKeyHex: string): Hex {
	if (!browser) throw new Error('burner key store is browser-only');
	const normalized = normalizePrivateKeyHex(privateKeyHex);
	window.localStorage.setItem(BURNER_KEY_STORAGE_KEY, normalized);
	return normalized;
}

/** Export for self-custody (copy / download). Same bytes as the stored key. */
export function exportBurnerKeyHex(): Hex | null {
	return loadBurnerKeyHex();
}

export function clearBurnerKey(): void {
	if (!browser) return;
	window.localStorage.removeItem(BURNER_KEY_STORAGE_KEY);
}

/** Derive the 20-byte `rootSignerAddress` (0x hex) for a burner private key. */
export function burnerAddressFromKeyHex(privateKeyHex: string): Hex {
	const sk = hexToBytes(normalizePrivateKeyHex(privateKeyHex));
	const pub = secp256k1.getPublicKey(sk, false);
	return bytesToHex(keccak_256(pub.slice(1)).slice(-20));
}

export function getBurnerAddress(): Hex | null {
	const hex = loadBurnerKeyHex();
	return hex ? burnerAddressFromKeyHex(hex) : null;
}
