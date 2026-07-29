import { decodeCborDeterministic as decodeCbor } from '@forestrie/encoding';
import { secp256k1 } from '@noble/curves/secp256k1';
import { keccak_256 } from '@noble/hashes/sha3';
import { describe, expect, it } from 'vitest';
import {
	buildOnboardAttestationKs256,
	buildOnboardAttestationKs256Remote,
	CLAIM_CHAIN_BINDING,
	COSE_ALG_KS256,
	encodeAttestationSigStructure,
	ONBOARD_ATTESTATION_CONTENT_TYPE
} from '../src/onboard-attestation.js';

const CHAIN_ID = '84532';
const ADDR = 'ab'.repeat(20);
const AUD = 'https://api-a.forest-2.forestrie.dev';
const NOW = 1785200000;

/** A local secp256k1 key standing in for the Privy wallet. */
const PRIV = new Uint8Array(32).fill(7);
const PUB = secp256k1.getPublicKey(PRIV, false);
const WALLET_ADDR = keccak_256(PUB.slice(1)).slice(-20);
const WALLET_ADDR_HEX = `0x${Buffer.from(WALLET_ADDR).toString('hex')}`;

/**
 * Stub of `@mandate/signer` /v1/sign: keccak over the posted Sig_structure,
 * 65-byte r‖s‖v — byte-identical to the Privy path the worker drives.
 */
function stubSigner(capture: { body?: Record<string, unknown> }): typeof fetch {
	return (async (_url: RequestInfo | URL, init?: RequestInit) => {
		const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
		capture.body = body;
		const sigStructure = Uint8Array.from(Buffer.from(String(body.sigStructure), 'base64'));
		const hash = keccak_256(sigStructure);
		const sig = secp256k1.sign(hash, PRIV, { prehash: false });
		const bytes = new Uint8Array(65);
		bytes.set(sig.toCompactRawBytes(), 0);
		bytes[64] = (sig.recovery ?? 0) + 27;
		return new Response(JSON.stringify({ signature: Buffer.from(bytes).toString('base64') }), {
			status: 200
		});
	}) as typeof fetch;
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

async function buildAttestation(capture: { body?: Record<string, unknown> }) {
	return buildOnboardAttestationKs256Remote(
		{
			signerUrl: 'https://signer.example/v1/sign',
			bearerToken: 'signer-token',
			keyRef: 'user-log-wallet',
			rootSignerAddress: WALLET_ADDR_HEX,
			logIdHex32: '9d'.repeat(16),
			fetchImpl: stubSigner(capture)
		},
		{ chainId: CHAIN_ID, univocityAddr: ADDR, aud: AUD, nowSec: NOW }
	);
}

describe('onboard attestation via signer callback (plan-2607-45 slice 02)', () => {
	// The console SigningBackend shape: keccak over the Sig_structure, low-S
	// 65-byte r‖s‖v with v ∈ {0,1} — same seam as the account-read producer.
	async function localSign(sigStructure: Uint8Array): Promise<Uint8Array> {
		const sig = secp256k1.sign(keccak_256(sigStructure), PRIV, { prehash: false });
		const bytes = new Uint8Array(65);
		bytes.set(sig.toCompactRawBytes(), 0);
		bytes[64] = sig.recovery ?? 0;
		return bytes;
	}

	it('produces the onboard-domain COSE_Sign1 that passes canopy-shape verification', async () => {
		const attestation = await buildOnboardAttestationKs256(
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

		// Onboard content type, NOT the read domain — cross-protocol discipline.
		const header = decodeCbor(new Uint8Array(prot)) as Map<number, unknown>;
		expect(header.get(1)).toBe(COSE_ALG_KS256);
		expect(header.get(3)).toBe(ONBOARD_ATTESTATION_CONTENT_TYPE);

		const claims = decodeCbor(new Uint8Array(payload)) as Map<number, unknown>;
		expect(claims.get(3)).toBe(AUD);
		const binding = claims.get(CLAIM_CHAIN_BINDING) as Map<number, unknown>;
		expect(binding.get(1)).toBe(CHAIN_ID);
		expect(binding.get(2)).toBe(ADDR);
	});

	it('propagates signer failures instead of assembling a broken envelope', async () => {
		await expect(
			buildOnboardAttestationKs256(
				{ chainId: CHAIN_ID, univocityAddr: ADDR, aud: AUD, nowSec: NOW },
				async () => {
					throw new Error('user rejected');
				}
			)
		).rejects.toThrow('user rejected');
	});
});

describe('BYOK onboard attestation (ADR-0059 D8, KS256 via remote signer)', () => {
	it('produces a COSE_Sign1 that passes canopy-shape KS256 verification', async () => {
		const capture: { body?: Record<string, unknown> } = {};
		const attestation = await buildAttestation(capture);

		// Envelope: [bstr protected, {}, bstr payload, bstr signature].
		const parts = decodeCbor(attestation) as [Uint8Array, unknown, Uint8Array, Uint8Array];
		expect(parts).toHaveLength(4);
		const [prot, , payload, signature] = parts;

		// The verifier rebuilds Sig_structure from the RECEIVED bytes.
		const sigStructure = encodeAttestationSigStructure(
			new Uint8Array(prot),
			new Uint8Array(payload)
		);
		expect(verifyKs256(sigStructure, new Uint8Array(signature), WALLET_ADDR)).toBe(true);

		// Protected header: chain-matching alg + the domain-separating content type.
		const header = decodeCbor(new Uint8Array(prot)) as Map<number, unknown>;
		expect(header.get(1)).toBe(COSE_ALG_KS256);
		expect(header.get(3)).toBe(ONBOARD_ATTESTATION_CONTENT_TYPE);

		// CWT claims: iss = canonical instance id, aud, bounded window, binding.
		const claims = decodeCbor(new Uint8Array(payload)) as Map<number, unknown>;
		expect(claims.get(1)).toBe(`eip155:${CHAIN_ID}:0x${ADDR}`);
		expect(claims.get(3)).toBe(AUD);
		expect(claims.get(6)).toBe(NOW);
		expect(claims.get(4)).toBe(NOW + 3600);
		const binding = claims.get(CLAIM_CHAIN_BINDING) as Map<number, unknown>;
		expect(binding.get(1)).toBe(CHAIN_ID);
		expect(binding.get(2)).toBe(ADDR);

		// The signer saw the ADR-0003 SignRequest shape.
		expect(capture.body).toMatchObject({
			logId: '9d'.repeat(16),
			keyRef: 'user-log-wallet',
			rootSignerAddress: WALLET_ADDR_HEX
		});
	});

	it('emits tag-free CBOR throughout (canopy strict-decoder compatible)', async () => {
		const attestation = await buildAttestation({});
		const hex = Buffer.from(attestation).toString('hex');
		// No cbor-x Map tag (d9 0103) or Uint8Array tag (d8 40) anywhere.
		expect(hex).not.toContain('d90103');
		expect(hex).not.toContain('d840');
		// Envelope framing is a plain 4-array with bstr members.
		expect(attestation[0]).toBe(0x84);
	});

	it('rejects a non-canonical address and a bad remote signature length', async () => {
		await expect(
			buildOnboardAttestationKs256Remote(
				{
					signerUrl: 'https://signer.example/v1/sign',
					bearerToken: 't',
					keyRef: 'k',
					rootSignerAddress: WALLET_ADDR_HEX,
					logIdHex32: '9d'.repeat(16),
					fetchImpl: (async () => new Response('{}', { status: 200 })) as typeof fetch
				},
				{ chainId: CHAIN_ID, univocityAddr: `0x${ADDR}`, aud: AUD, nowSec: NOW }
			)
		).rejects.toThrow(/40 lowercase hex/);

		const shortSig = (async () =>
			new Response(JSON.stringify({ signature: Buffer.from([1, 2, 3]).toString('base64') }), {
				status: 200
			})) as typeof fetch;
		await expect(
			buildOnboardAttestationKs256Remote(
				{
					signerUrl: 'https://signer.example/v1/sign',
					bearerToken: 't',
					keyRef: 'k',
					rootSignerAddress: WALLET_ADDR_HEX,
					logIdHex32: '9d'.repeat(16),
					fetchImpl: shortSig
				},
				{ chainId: CHAIN_ID, univocityAddr: ADDR, aud: AUD, nowSec: NOW }
			)
		).rejects.toThrow(/65 bytes/);
	});
});
