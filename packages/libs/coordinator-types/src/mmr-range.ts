/**
 * Inclusive delegation MMR range as parsed from a coordinator JSON body or
 * webhook event (canopy plan-2611-01, FOR-613). Mirrors canopy's
 * [`mmr-range.ts`](https://github.com/forestrie/canopy/blob/main/packages/apps/delegation-coordinator/src/mmr-range.ts):
 * both bounds canonical decimal uint64 strings, `mmrStart <= mmrEnd`.
 */

import { DecimalUint64Error, parseDecimalUint64 } from './decimal-uint64.js';

/** An inclusive MMR index range with `mmrStart <= mmrEnd`, as `bigint`. */
export interface MmrRange {
	mmrStart: bigint;
	mmrEnd: bigint;
}

/**
 * Parse `mmrStart` / `mmrEnd` from a decoded JSON object.
 *
 * @throws {@link DecimalUint64Error} when a bound is missing or malformed
 *   (including a JSON number), or `mmrStart > mmrEnd`.
 */
export function parseMmrRange(body: { mmrStart?: unknown; mmrEnd?: unknown }): MmrRange {
	const mmrStart = parseDecimalUint64(body.mmrStart, 'mmrStart');
	const mmrEnd = parseDecimalUint64(body.mmrEnd, 'mmrEnd');
	if (mmrStart > mmrEnd) {
		throw new DecimalUint64Error('mmrStart must not exceed mmrEnd');
	}
	return { mmrStart, mmrEnd };
}
