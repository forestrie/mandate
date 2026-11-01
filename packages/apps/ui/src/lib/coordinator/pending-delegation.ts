/**
 * Pending delegation entries as the console works with them: the coordinator
 * sends each MMR range bound as a canonical decimal uint64 string
 * (canopy plan-2611-01 D1, `GET /api/delegations/pending`); the console
 * parses them to `bigint` here, at the edge, and formats them back only
 * when building a certificate submit body.
 */

import {
	parseMmrRange,
	type PendingEntry,
	type PendingListResponse
} from '@mandate/coordinator-types';

/** A {@link PendingEntry} with its demanded window parsed to `bigint`. */
export interface PendingDelegation extends Omit<PendingEntry, 'mmrStart' | 'mmrEnd'> {
	mmrStart: bigint;
	mmrEnd: bigint;
}

/** A {@link PendingListResponse} whose entries are parsed. */
export interface PendingDelegationList extends Omit<PendingListResponse, 'entries'> {
	entries: PendingDelegation[];
}

/**
 * Parse every entry's range. A JSON number, a non-canonical string, a value
 * above 2^64-1 or `mmrStart > mmrEnd` throws `DecimalUint64Error`: the
 * console must not sign over a window it cannot represent exactly.
 */
export function parsePendingListResponse(response: PendingListResponse): PendingDelegationList {
	return {
		...response,
		entries: response.entries.map((entry) => ({ ...entry, ...parseMmrRange(entry) }))
	};
}
