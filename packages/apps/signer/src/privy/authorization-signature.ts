/**
 * Privy owned-wallet authorization signature.
 *
 * ADR-0003 v1 uses Privy app-controlled wallets, which authorize with Basic auth
 * + the `privy-app-id` header only and MUST NOT send a
 * `privy-authorization-signature`. Owned/user-controlled wallets require that
 * header, but the correct construction is not implemented here yet, so we fail
 * closed rather than send an invalid signature (which Privy would reject).
 *
 * Correct scheme to implement when owned wallets are needed (see Privy docs and
 * `@privy-io/node` `formatRequestForAuthorizationSignature` /
 * `generateAuthorizationSignature`):
 *   1. Build the payload object
 *      `{ version: 1, method, url, body, headers: { 'privy-app-id': <id> } }`
 *      (omit `body` when empty; include only `privy-`-prefixed headers).
 *   2. Canonicalize per RFC 8785 (JSON Canonicalization Scheme) and encode UTF-8.
 *   3. Sign ECDSA P-256 over SHA-256 of those bytes; DER-encode; base64.
 *   4. The auth key is base64 PKCS#8 with a `wallet-auth:` prefix that must be
 *      stripped before import.
 * The current implementation in production produced `METHOD\nURL\nBODY` signed as
 * raw P1363, which does not match this scheme; failing closed prevents silent
 * use of that incorrect form.
 */
export function buildPrivyAuthorizationSignature(
	authorizationKey: string | undefined
): string | undefined {
	if (!authorizationKey?.trim()) return undefined;
	throw new Error(
		'Privy owned-wallet authorization signatures are not yet supported; ADR-0003 ' +
			'v1 uses app-controlled wallets (leave PRIVY_AUTHORIZATION_KEY unset)'
	);
}
