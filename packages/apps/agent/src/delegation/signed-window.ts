/**
 * The MMR window the agent signs for a `delegation.required` event.
 *
 * ADR-0050 §2: a signer covers "at least the demanded window if present,
 * with a horizon and TTL of its choosing" (conventionally `mmrStart = 0`).
 * Signing exactly the demanded window made every later seal miss coverage
 * and page the owner again, one signature per seal window (FOR-612). So the
 * agent signs from 0 to a fixed span past the demanded end, and a
 * window-less (standing key) event gets `[0, span]`.
 *
 * MMR indices are uint64 end to end (FOR-613): the
 * window is `bigint`, and `@forestrie/delegation-cose` encodes it as
 * canonical CBOR uint64.
 */

import { UINT64_MAX } from '@forestrie/delegation-cose';

/** Start of every window the agent signs. */
export const ADVANCE_MMR_START = 0n;

/**
 * Distance past the demanded end (or past 0 for a window-less event) that
 * the agent signs. 2^16-1 matches the canopy e2e kit's advance signer.
 */
export const ADVANCE_HORIZON_SPAN = 65535n;

/** An inclusive MMR window, uint64 bounds. */
export interface MmrWindow {
	mmrStart: bigint;
	mmrEnd: bigint;
}

/**
 * Resolve the window to sign: `[0, mmrEnd + span]`, the end clamped at
 * 2^64-1 (the largest MMR index) and never below the demanded end.
 */
export function signedWindowFor(demanded: Partial<MmrWindow>): MmrWindow {
	const demandedEnd = demanded.mmrEnd ?? 0n;
	const widenedEnd = demandedEnd + ADVANCE_HORIZON_SPAN;
	const clampedEnd = widenedEnd > UINT64_MAX ? UINT64_MAX : widenedEnd;
	return {
		mmrStart: ADVANCE_MMR_START,
		mmrEnd: clampedEnd < demandedEnd ? demandedEnd : clampedEnd
	};
}
