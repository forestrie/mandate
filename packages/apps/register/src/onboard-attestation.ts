/**
 * BYOK-side bootstrap-key registrant attestation (devdocs ADR-0059 D8,
 * canopy plan-2607-43 slice 06; mandate catch-up FOR-484).
 *
 * COSE_Sign1 whose payload is a CWT binding the exact chain binding, a
 * bounded freshness window, and the operator origin (`aud`), signed by the
 * contract's `bootstrapConfig()` key. In mandate that key is a Privy wallet
 * and NEVER leaves custody: the Sig_structure is posted to the
 * `@mandate/signer` `/v1/sign` route, which keccak-hashes and Privy-signs it
 * — exactly the `@forestrie/delegation-cose` KS256 profile canopy's verifier
 * (`onboarding/onboard-attestation.ts`) expects. Cross-protocol domain
 * separation comes from the signed content type; forestrie-cli's
 * `onboard-attestation.ts` is the direct-sign sibling producer.
 *
 * All CBOR/COSE framing comes from `@forestrie/encoding` — the platform
 * codec shared with canopy's verifier and forestrie-cli's sibling producer,
 * so the bytes agree by construction.
 */

import {
	encodeCborDeterministic,
	encodeCoseSign1Raw,
	encodeSigStructure
} from '@forestrie/encoding';

export const ONBOARD_ATTESTATION_CONTENT_TYPE = 'application/forestrie-onboard-attestation+cwt';

export const COSE_ALG_KS256 = -65799;

/** Private CWT claim: map {1: chainId tstr, 2: univocityAddr 40-lowerhex}. */
export const CLAIM_CHAIN_BINDING = -70000;

/** Default freshness window (canopy's policy ceiling is 24 h). */
export const DEFAULT_ATTESTATION_WINDOW_SEC = 3600;

export interface OnboardAttestationInput {
	/** Bare decimal chain id. */
	chainId: string;
	/** 40-hex lowercase address body, no 0x. */
	univocityAddr: string;
	/** Operator deployment origin, e.g. `https://api-a.forest-2.forestrie.dev`. */
	aud: string;
	nowSec: number;
	windowSec?: number;
}

/** Remote signing via `@mandate/signer` — the bootstrap key stays in Privy. */
export interface RemoteAttestationSigner {
	signerUrl: string;
	bearerToken: string;
	/** Key directory entry for the bootstrap wallet. */
	keyRef: string;
	/** The wallet address — must equal the chain's `bootstrapConfig()` key. */
	rootSignerAddress: string;
	/** 32-hex log id the key directory authorises for this wallet. */
	logIdHex32: string;
	fetchImpl?: typeof fetch;
}

/** RFC 9052 Sig_structure for this envelope (empty external AAD). */
export function encodeAttestationSigStructure(prot: Uint8Array, payload: Uint8Array): Uint8Array {
	return encodeSigStructure(prot, new Uint8Array(0), payload);
}

function protectedBytes(): Uint8Array {
	return encodeCborDeterministic(
		new Map<number, unknown>([
			[1, COSE_ALG_KS256],
			[3, ONBOARD_ATTESTATION_CONTENT_TYPE]
		])
	);
}

function claimsBytes(input: OnboardAttestationInput): Uint8Array {
	const window = input.windowSec ?? DEFAULT_ATTESTATION_WINDOW_SEC;
	return encodeCborDeterministic(
		new Map<number, unknown>([
			[1, `eip155:${input.chainId}:0x${input.univocityAddr}`],
			[3, input.aud],
			[4, input.nowSec + window],
			[6, input.nowSec],
			[
				CLAIM_CHAIN_BINDING,
				new Map<number, unknown>([
					[1, input.chainId],
					[2, input.univocityAddr]
				])
			]
		])
	);
}

function bytesToBase64(bytes: Uint8Array): string {
	let bin = '';
	for (const b of bytes) bin += String.fromCharCode(b);
	return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
	const bin = atob(b64);
	const out = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
	return out;
}

/**
 * Build the KS256 attestation with the signature produced remotely by the
 * mandate signer (Privy custody). The signer keccak-hashes the posted
 * Sig_structure and returns the 65-byte `r‖s‖v` EOA signature, recovery-
 * checked against `rootSignerAddress` server-side.
 */
export async function buildOnboardAttestationKs256Remote(
	signer: RemoteAttestationSigner,
	input: OnboardAttestationInput
): Promise<Uint8Array> {
	if (!/^[0-9a-f]{40}$/.test(input.univocityAddr)) {
		throw new Error('univocityAddr must be 40 lowercase hex chars without 0x');
	}
	const prot = protectedBytes();
	const payload = claimsBytes(input);
	const sigStructure = encodeAttestationSigStructure(prot, payload);

	const doFetch =
		signer.fetchImpl ?? ((input2: RequestInfo | URL, init?: RequestInit) => fetch(input2, init));
	const response = await doFetch(signer.signerUrl, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${signer.bearerToken}`
		},
		body: JSON.stringify({
			logId: signer.logIdHex32,
			keyRef: signer.keyRef,
			rootSignerAddress: signer.rootSignerAddress,
			sigStructure: bytesToBase64(sigStructure)
		})
	});
	if (!response.ok) {
		const detail = await response.text().catch(() => '');
		throw new Error(`attestation remote sign failed: ${response.status} ${detail.slice(0, 200)}`);
	}
	const body = (await response.json()) as { signature?: string };
	if (!body.signature) {
		throw new Error('attestation remote sign: response missing signature');
	}
	const signature = base64ToBytes(body.signature);
	if (signature.length !== 65) {
		throw new Error(`KS256 signature must be 65 bytes, got ${signature.length}`);
	}
	return encodeCoseSign1Raw(prot, new Map(), payload, signature);
}
