/**
 * The MMR window the console signs for a pending delegation entry.
 *
 * Mirrors `@mandate/agent`'s `delegation/signed-window.ts` (the two apps
 * share no runtime library). ADR-0050 §2 lets a signer cover "at least the
 * demanded window"; signing exactly the demanded window made every later
 * seal raise a new demand, one owner signature per seal window (FOR-612).
 * MMR indices are uint64 end to end (FOR-613).
 */

import { UINT64_MAX } from '@forestrie/delegation-cose';

/** Distance past the demanded end the console signs. */
export const ADVANCE_HORIZON_SPAN = 65535n;

/**
 * `[0, mmrEnd + span]`, the end clamped at 2^64-1 (the largest MMR index)
 * and never below the demanded end.
 */
export function signedWindowFor(demanded: { mmrEnd: bigint }): {
	mmrStart: bigint;
	mmrEnd: bigint;
} {
	const widenedEnd = demanded.mmrEnd + ADVANCE_HORIZON_SPAN;
	const clampedEnd = widenedEnd > UINT64_MAX ? UINT64_MAX : widenedEnd;
	return { mmrStart: 0n, mmrEnd: clampedEnd < demanded.mmrEnd ? demanded.mmrEnd : clampedEnd };
}
