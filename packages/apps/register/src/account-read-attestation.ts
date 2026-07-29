/**
 * Account-read attestation producer (FOR-485, canopy FOR-497): the ADR-0059
 * D8 bootstrap-key envelope reused as a read credential for canopy's
 * owner-facing `GET /api/payments/accounts/{univocityInstanceId}`.
 *
 * Same COSE_Sign1/CWT framing as the onboard attestation — chain binding,
 * bounded freshness window, `aud` = the canopy origin — under its OWN signed
 * content type, so a captured onboarding attestation can never replay as a
 * read credential and vice versa. The window is minutes, not onboarding's
 * hours: the read is interactive and the key is at hand (canopy's ceiling is
 * 300 s; mint tighter).
 *
 * Signing is a callback, not the remote `@mandate/signer` route: the console
 * signs in-browser through its `SigningBackend` seam (Privy `secp256k1_sign`
 * over keccak256(Sig_structure), normalised to low-S r‖s‖v) — byte-identical
 * to what the signer worker produces server-side.
 */

import {
	assembleKs256Attestation,
	encodeBootstrapKeyAttestationParts,
	type Ks256SigStructureSign,
	type OnboardAttestationInput
} from './onboard-attestation.js';

export const ACCOUNT_READ_ATTESTATION_CONTENT_TYPE = 'application/forestrie-account-read+cwt';

/** Authorization scheme canopy's account read expects. */
export const ACCOUNT_READ_AUTH_SCHEME = 'Forestrie-Account-Read';

/** Default freshness window — well inside canopy's 300 s read-domain ceiling. */
export const DEFAULT_ACCOUNT_READ_WINDOW_SEC = 90;

/** Same claim set as onboarding; only the signed content type differs. */
export type AccountReadAttestationInput = OnboardAttestationInput;

/**
 * Signer-callback seam shared with the onboard producer — defined in
 * `onboard-attestation.ts`, re-exported here so existing consumers of this
 * subpath keep working.
 */
export type { Ks256SigStructureSign } from './onboard-attestation.js';

/** Build the read-domain KS256 attestation via a caller-supplied signer. */
export async function buildAccountReadAttestationKs256(
	input: AccountReadAttestationInput,
	sign: Ks256SigStructureSign
): Promise<Uint8Array> {
	const parts = encodeBootstrapKeyAttestationParts(
		ACCOUNT_READ_ATTESTATION_CONTENT_TYPE,
		input,
		DEFAULT_ACCOUNT_READ_WINDOW_SEC
	);
	return assembleKs256Attestation(parts, await sign(parts.sigStructure));
}

function bytesToBase64Url(bytes: Uint8Array): string {
	let bin = '';
	for (const b of bytes) bin += String.fromCharCode(b);
	const b64 = typeof btoa === 'function' ? btoa(bin) : Buffer.from(bytes).toString('base64');
	return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Render the `Authorization` header value. Treat the result as a credential:
 * never log it (plan-2607-07 ops note).
 */
export function accountReadAuthorizationHeader(attestation: Uint8Array): string {
	return `${ACCOUNT_READ_AUTH_SCHEME} ${bytesToBase64Url(attestation)}`;
}
