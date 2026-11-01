import { decodeCborDeterministic } from '@forestrie/encoding';
import { describe, expect, it } from 'vitest';
import {
	E2E_AUTH_LOG_ID,
	SAMPLE_DELEGATED_PUBLIC_KEY_B64,
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
		expect(BigInt(entries[1]!.mmrStart)).toBeGreaterThan(BigInt(entries[0]!.mmrStart));
	});

	it('carries range bounds as canonical decimal strings (plan-2611-01 D1)', () => {
		for (const entry of samplePendingEntries(2)) {
			expect(entry.mmrStart).toMatch(/^(0|[1-9][0-9]*)$/);
			expect(entry.mmrEnd).toMatch(/^(0|[1-9][0-9]*)$/);
		}
	});
});

describe('SAMPLE_DELEGATED_PUBLIC_KEY_B64', () => {
	it('is a canonical COSE_Key: plain bstr coordinates, no cbor-x tag 64', () => {
		const bytes = Uint8Array.from(Buffer.from(SAMPLE_DELEGATED_PUBLIC_KEY_B64, 'base64'));
		const key = decodeCborDeterministic(bytes) as Map<number, unknown>;
		expect(key.get(1)).toBe(2);
		expect(key.get(-1)).toBe(1);
		for (const label of [-2, -3]) {
			const coordinate = key.get(label);
			expect(coordinate).toBeInstanceOf(Uint8Array);
			expect((coordinate as Uint8Array).length).toBe(32);
		}
	});
});
