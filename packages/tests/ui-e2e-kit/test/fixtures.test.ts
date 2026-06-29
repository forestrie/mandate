import { describe, expect, it } from 'vitest';
import {
	E2E_AUTH_LOG_ID,
	samplePendingEntries,
	samplePendingEntry
} from '../src/fixtures.js';

describe('samplePendingEntry', () => {
	it('uses authority log id without hyphens in authLogIdHex32', () => {
		const entry = samplePendingEntry();
		expect(entry.authLogIdHex32).toBe(E2E_AUTH_LOG_ID.replace(/-/g, ''));
		expect(entry.id).toBe('entry-1');
	});

	it('applies overrides without mutating defaults', () => {
		const entry = samplePendingEntry({ id: 'custom' });
		expect(entry.id).toBe('custom');
		expect(samplePendingEntry().id).toBe('entry-1');
	});
});

describe('samplePendingEntries', () => {
	it('returns distinct ids and monotonic mmr ranges', () => {
		const entries = samplePendingEntries(2);
		expect(entries).toHaveLength(2);
		expect(entries[0]?.id).toBe('entry-1');
		expect(entries[1]?.id).toBe('entry-2');
		expect(entries[1]!.mmrStart).toBeGreaterThan(entries[0]!.mmrStart);
	});
});
