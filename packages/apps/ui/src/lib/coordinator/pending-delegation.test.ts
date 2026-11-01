import { describe, expect, it } from 'vitest';
import type { PendingEntry, PendingListResponse } from '@mandate/coordinator-types';
import { DecimalUint64Error } from '@forestrie/delegation-cose';
import { parsePendingListResponse } from './pending-delegation.js';

function wireEntry(window: Record<string, unknown>): PendingEntry {
	return {
		id: 'pending-1',
		authLogIdHex32: 'a'.repeat(32),
		logIdHex32: 'b'.repeat(32),
		mmrStart: '0',
		mmrEnd: '0',
		delegatedPublicKeyHash: 'hash',
		delegatedPublicKey: 'ZGVsZWdhdGVkLWtleQ==',
		requestedAt: 1_700_000_000,
		...window
	} as PendingEntry;
}

function listOf(...entries: PendingEntry[]): PendingListResponse {
	return { entries, offset: 0, limit: 50, shardCount: 1 };
}

describe('parsePendingListResponse', () => {
	it('parses decimal-string bounds to bigint, exactly above 2^53', () => {
		const parsed = parsePendingListResponse(
			listOf(wireEntry({ mmrStart: '9007199254740993', mmrEnd: '18446744073709551615' }))
		);
		expect(parsed.entries[0]).toMatchObject({
			id: 'pending-1',
			mmrStart: (1n << 53n) + 1n,
			mmrEnd: (1n << 64n) - 1n
		});
		expect(parsed.shardCount).toBe(1);
	});

	it.each([
		['JSON numbers', { mmrStart: 1, mmrEnd: 8 }],
		['a leading zero', { mmrStart: '01', mmrEnd: '8' }],
		['a value above 2^64-1', { mmrStart: '0', mmrEnd: '18446744073709551616' }],
		['start above end', { mmrStart: '9', mmrEnd: '8' }]
	])('rejects %s', (_label, window) => {
		expect(() => parsePendingListResponse(listOf(wireEntry(window)))).toThrow(DecimalUint64Error);
	});
});
