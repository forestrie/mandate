/**
 * Mint the `Forestrie-Account-Read` Authorization value in the browser
 * (FOR-485): holder-of-bootstrap-key IS the account owner, so the connected
 * signing backend (Privy embedded wallet, or the burner in demo mode) signs
 * the D8 read attestation directly — no session, no BFF.
 *
 * Minted values are cached per instance until shortly before `exp` so a
 * refresh burst reuses one signature. The value is a live credential: it is
 * never logged and never persisted.
 */

import {
	accountReadAuthorizationHeader,
	buildAccountReadAttestationKs256,
	DEFAULT_ACCOUNT_READ_WINDOW_SEC
} from '@mandate/register/account-read-attestation';
import { chainBindingFromUnivocityInstanceId } from '@mandate/register/univocity-instance-id';
import { resolveSigningBackend } from '$lib/signing/resolve-backend.js';
import { canopyOrigin } from './canopy-client.js';

/** Re-mint this many seconds before `exp` rather than serving a stale value. */
const EXPIRY_MARGIN_SEC = 15;

interface MintedAuthorization {
	header: string;
	exp: number;
}

const cache = new Map<string, MintedAuthorization>();

/** Drop minted values (wallet switch / logout / tests). */
export function clearAccountReadAuthorizations(): void {
	cache.clear();
}

/**
 * Return a fresh-enough Authorization header value for the instance's
 * fee-account read, minting (and caching) one when needed.
 */
export async function mintAccountReadAuthorization(
	univocityInstanceId: string,
	nowSec: number = Math.floor(Date.now() / 1000)
): Promise<string> {
	const cached = cache.get(univocityInstanceId);
	if (cached && nowSec < cached.exp - EXPIRY_MARGIN_SEC) {
		return cached.header;
	}
	const { chainId, univocityAddr } = chainBindingFromUnivocityInstanceId(univocityInstanceId);
	const backend = await resolveSigningBackend();
	const attestation = await buildAccountReadAttestationKs256(
		{ chainId, univocityAddr, aud: canopyOrigin(), nowSec },
		(sigStructure) => backend.signKs256SigStructure(sigStructure)
	);
	const header = accountReadAuthorizationHeader(attestation);
	cache.set(univocityInstanceId, { header, exp: nowSec + DEFAULT_ACCOUNT_READ_WINDOW_SEC });
	return header;
}
