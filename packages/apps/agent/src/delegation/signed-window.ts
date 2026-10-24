/**
 * The MMR window the agent signs for a `delegation.required` event.
 *
 * ADR-0050 §2: a signer covers "at least the demanded window if present,
 * with a horizon and TTL of its choosing" (conventionally `mmrStart = 0`).
 * Signing exactly the demanded window made every later seal miss coverage
 * and page the owner again, one signature per seal window (FOR-612). So the
 * agent signs from 0 to a fixed span past the demanded end, and a
 * window-less (standing key) event gets `[0, span]`.
 */

/** Start of every window the agent signs. */
export const ADVANCE_MMR_START = 0;

/**
 * Distance past the demanded end (or past 0 for a window-less event) that
 * the agent signs. 2^16-1 matches the canopy e2e kit's advance signer.
 */
export const ADVANCE_HORIZON_SPAN = 65535;

/**
 * Largest MMR index a certificate can carry. `@forestrie/delegation-cose`
 * encodes the payload with cbor-x, which writes integers above uint32 as
 * float64; strict CBOR decoders reject that, so the widened end is capped
 * here rather than the certificate becoming unreadable.
 */
export const MAX_CERTIFICATE_MMR_INDEX = 0xffffffff;

export interface MmrWindow {
	mmrStart: number;
	mmrEnd: number;
}

/**
 * Resolve the window to sign. Never narrower than the demanded window: if
 * the demanded end is already past the cap, it is signed as demanded.
 */
export function signedWindowFor(demanded: Partial<MmrWindow>): MmrWindow {
	const demandedEnd = demanded.mmrEnd ?? 0;
	const widenedEnd = Math.min(demandedEnd + ADVANCE_HORIZON_SPAN, MAX_CERTIFICATE_MMR_INDEX);
	return { mmrStart: ADVANCE_MMR_START, mmrEnd: Math.max(demandedEnd, widenedEnd) };
}
