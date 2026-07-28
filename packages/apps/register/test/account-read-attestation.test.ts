import { decodeCborDeterministic as decodeCbor } from '@forestrie/encoding';
import { secp256k1 } from '@noble/curves/secp256k1';
import { keccak_256 } from '@noble/hashes/sha3';
import { describe, expect, it } from 'vitest';
import {
	accountReadAuthorizationHeader,
	ACCOUNT_READ_ATTESTATION_CONTENT_TYPE,
	buildAccountReadAttestationKs256,
	DEFAULT_ACCOUNT_READ_WINDOW_SEC
} from '../src/account-read-attestation.js';
import {
	CLAIM_CHAIN_BINDING,
	COSE_ALG_KS256,
	encodeAttestationSigStructure,
	ONBOARD_ATTESTATION_CONTENT_TYPE
} from '../src/onboard-attestation.js';

const CHAIN_ID = '84532';
const ADDR = 'cd'.repeat(20);
const AUD = 'https://api-a.forest-2.forestrie.dev';
const NOW = 1785200000;

/** A local secp256k1 key standing in for the Privy embedded wallet. */
const PRIV = new Uint8Array(32).fill(9);
const PUB = secp256k1.getPublicKey(PRIV, false);
const WALLET_ADDR = keccak_256(PUB.slice(1)).slice(-20);

/**
 * Browser-shaped signer callback: keccak over the Sig_structure, low-S
 * 65-byte r‖s‖v with v ∈ {0,1} — what `normalizeKs256Signature` hands back
 * from the Privy `secp256k1_sign` path.
 */
async function localSign(sigStructure: Uint8Array): Promise<Uint8Array> {
	const sig = secp256k1.sign(keccak_256(sigStructure), PRIV, { prehash: false });
	const bytes = new Uint8Array(65);
	bytes.set(sig.toCompactRawBytes(), 0);
	bytes[64] = sig.recovery ?? 0;
	return bytes;
}

/** Mirror of canopy's `verifyKs256` (onboarding/onboard-attestation.ts). */
function verifyKs256(sigStructure: Uint8Array, signature: Uint8Array, addr20: Uint8Array): boolean {
	if (signature.length !== 65 || addr20.length !== 20) return false;
	const hash = keccak_256(sigStructure);
	let v = signature[64]!;
	if (v >= 27) v -= 27;
	if (v > 3) return false;
	const sig = secp256k1.Signature.fromCompact(signature.slice(0, 64)).addRecoveryBit(v);
	const pub = sig.recoverPublicKey(hash).toRawBytes(false);
	const recovered = keccak_256(pub.slice(1)).slice(-20);
	return Buffer.from(recovered).equals(Buffer.from(addr20));
}

describe('account-read attestation (D8 read domain, KS256 via signer callback)', () => {
	it('produces a COSE_Sign1 that passes canopy-shape KS256 verification', async () => {
		const attestation = await buildAccountReadAttestationKs256(
			{ chainId: CHAIN_ID, univocityAddr: ADDR, aud: AUD, nowSec: NOW },
			localSign
		);

		const parts = decodeCbor(attestation) as [Uint8Array, unknown, Uint8Array, Uint8Array];
		expect(parts).toHaveLength(4);
		const [prot, , payload, signature] = parts;

		const sigStructure = encodeAttestationSigStructure(
			new Uint8Array(prot),
			new Uint8Array(payload)
		);
		expect(verifyKs256(sigStructure, new Uint8Array(signature), WALLET_ADDR)).toBe(true);

		// Protected header: KS256 + the READ content type, never the onboard one.
		const header = decodeCbor(new Uint8Array(prot)) as Map<number, unknown>;
		expect(header.get(1)).toBe(COSE_ALG_KS256);
		expect(header.get(3)).toBe(ACCOUNT_READ_ATTESTATION_CONTENT_TYPE);
		expect(header.get(3)).not.toBe(ONBOARD_ATTESTATION_CONTENT_TYPE);

		// CWT claims: read-domain window is seconds-scale, inside canopy's 300 s.
		const claims = decodeCbor(new Uint8Array(payload)) as Map<number, unknown>;
		expect(claims.get(1)).toBe(`eip155:${CHAIN_ID}:0x${ADDR}`);
		expect(claims.get(3)).toBe(AUD);
		expect(claims.get(6)).toBe(NOW);
		expect(claims.get(4)).toBe(NOW + DEFAULT_ACCOUNT_READ_WINDOW_SEC);
		expect(DEFAULT_ACCOUNT_READ_WINDOW_SEC).toBeLessThanOrEqual(300);
		const binding = claims.get(CLAIM_CHAIN_BINDING) as Map<number, unknown>;
		expect(binding.get(1)).toBe(CHAIN_ID);
		expect(binding.get(2)).toBe(ADDR);
	});

	it('honours an explicit window override', async () => {
		const attestation = await buildAccountReadAttestationKs256(
			{ chainId: CHAIN_ID, univocityAddr: ADDR, aud: AUD, nowSec: NOW, windowSec: 120 },
			localSign
		);
		const [, , payload] = decodeCbor(attestation) as [Uint8Array, unknown, Uint8Array, Uint8Array];
		const claims = decodeCbor(new Uint8Array(payload)) as Map<number, unknown>;
		expect(claims.get(4)).toBe(NOW + 120);
	});

	it('renders a base64url Authorization value under the read scheme', async () => {
		const attestation = await buildAccountReadAttestationKs256(
			{ chainId: CHAIN_ID, univocityAddr: ADDR, aud: AUD, nowSec: NOW },
			localSign
		);
		const header = accountReadAuthorizationHeader(attestation);
		const [scheme, b64url, rest] = header.split(' ');
		expect(scheme).toBe('Forestrie-Account-Read');
		expect(rest).toBeUndefined();
		expect(b64url).toMatch(/^[A-Za-z0-9_-]+$/);
		// Round-trips to the exact envelope bytes (canopy tolerates -/_ only).
		const b64 = b64url!.replace(/-/g, '+').replace(/_/g, '/');
		const decoded = Uint8Array.from(Buffer.from(b64, 'base64'));
		expect(Buffer.from(decoded).equals(Buffer.from(attestation))).toBe(true);
	});

	it('rejects a non-canonical address and a bad signature length', async () => {
		await expect(
			buildAccountReadAttestationKs256(
				{ chainId: CHAIN_ID, univocityAddr: `0x${ADDR}`, aud: AUD, nowSec: NOW },
				localSign
			)
		).rejects.toThrow(/40 lowercase hex/);
		await expect(
			buildAccountReadAttestationKs256(
				{ chainId: CHAIN_ID, univocityAddr: ADDR, aud: AUD, nowSec: NOW },
				async () => new Uint8Array(64)
			)
		).rejects.toThrow(/65 bytes/);
	});
});
