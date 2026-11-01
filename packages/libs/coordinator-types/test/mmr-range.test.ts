/**
 * `parseMmrRange` reads a coordinator JSON range: both bounds canonical
 * decimal uint64 strings (codec from `@forestrie/delegation-cose`, which
 * owns the accept/reject cases), and `mmrStart <= mmrEnd`.
 */

import { DecimalUint64Error } from '@forestrie/delegation-cose';
import { describe, expect, it } from 'vitest';
import { parseMmrRange } from '../src/index.js';

describe('parseMmrRange', () => {
	it('parses both bounds', () => {
		expect(parseMmrRange({ mmrStart: '5', mmrEnd: '5' })).toEqual({
			mmrStart: 5n,
			mmrEnd: 5n
		});
	});

	it('rejects start above end', () => {
		expect(() => parseMmrRange({ mmrStart: '6', mmrEnd: '5' })).toThrow(DecimalUint64Error);
	});

	it('rejects a missing bound', () => {
		expect(() => parseMmrRange({ mmrStart: '0' })).toThrow(/mmrEnd/);
	});

	it('rejects JSON numbers (hard cutover)', () => {
		expect(() => parseMmrRange({ mmrStart: 0, mmrEnd: 8 })).toThrow(/mmrStart/);
	});
});
