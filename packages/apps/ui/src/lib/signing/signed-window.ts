/**
 * The MMR window the console signs for a pending delegation entry.
 *
 * Mirrors `@mandate/agent`'s `delegation/signed-window.ts` (the two apps
 * share no runtime library). ADR-0050 §2 lets a signer cover "at least the
 * demanded window"; signing exactly the demanded window made every later
 * seal raise a new demand, one owner signature per seal window (FOR-612).
 */

/** Distance past the demanded end the console signs. */
export const ADVANCE_HORIZON_SPAN = 65535;

/**
 * Largest MMR index a certificate can carry: `@forestrie/delegation-cose`
 * encodes with cbor-x, which writes integers above uint32 as float64.
 */
export const MAX_CERTIFICATE_MMR_INDEX = 0xffffffff;

/** `[0, mmrEnd + span]`, capped, and never narrower than the demand. */
export function signedWindowFor(demanded: { mmrEnd: number }): {
	mmrStart: number;
	mmrEnd: number;
} {
	const widenedEnd = Math.min(demanded.mmrEnd + ADVANCE_HORIZON_SPAN, MAX_CERTIFICATE_MMR_INDEX);
	return { mmrStart: 0, mmrEnd: Math.max(demanded.mmrEnd, widenedEnd) };
}
