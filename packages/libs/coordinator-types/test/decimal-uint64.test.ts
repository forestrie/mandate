/**
 * The coordinator's JSON range codec (canopy plan-2611-01 D1, FOR-613):
 * each MMR range bound is a canonical decimal uint64 string. These cases
 * mirror canopy's delegation-coordinator `decimal-uint64.test.ts` so both
 * ends of the wire accept and reject exactly the same text.
 */

import { describe, expect, it } from 'vitest';
import {
	DecimalUint64Error,
	formatDecimalUint64,
	parseDecimalUint64,
	parseMmrRange,
	UINT64_MAX
} from '../src/index.js';

describe('parseDecimalUint64', () => {
	it.each([
		['0', 0n],
		['1', 1n],
		['4294967297', (1n << 32n) + 1n],
		['9007199254740993', (1n << 53n) + 1n],
		['18446744073709551615', UINT64_MAX]
	])('parses %s', (text, value) => {
		expect(parseDecimalUint64(text, 'mmrEnd')).toBe(value);
	});

	it.each([
		['a JSON number', 7],
		['a bigint', 7n],
		['null', null],
		['undefined', undefined],
		['empty', ''],
		['leading zero', '07'],
		['double zero', '00'],
		['plus sign', '+7'],
		['minus sign', '-7'],
		['minus zero', '-0'],
		['whitespace', ' 7'],
		['trailing newline', '7\n'],
		['fraction', '7.0'],
		['exponent', '7e0'],
		['hex', '0x7'],
		['2^64', '18446744073709551616'],
		['21 digits', '100000000000000000000']
	])('rejects %s', (_label, value) => {
		expect(() => parseDecimalUint64(value, 'mmrEnd')).toThrow(DecimalUint64Error);
		expect(() => parseDecimalUint64(value, 'mmrEnd')).toThrow(/mmrEnd/);
	});
});

describe('formatDecimalUint64', () => {
	it('is String(n) for a safe integer and exact above 2^53', () => {
		expect(formatDecimalUint64(16383n)).toBe(String(16383));
		expect(formatDecimalUint64(BigInt(Number.MAX_SAFE_INTEGER))).toBe(
			String(Number.MAX_SAFE_INTEGER)
		);
		expect(formatDecimalUint64(UINT64_MAX)).toBe('18446744073709551615');
	});

	it('refuses values outside uint64', () => {
		expect(() => formatDecimalUint64(-1n)).toThrow(DecimalUint64Error);
		expect(() => formatDecimalUint64(1n << 64n)).toThrow(DecimalUint64Error);
	});

	it('round-trips through parse', () => {
		const value = (1n << 60n) + 12345n;
		expect(parseDecimalUint64(formatDecimalUint64(value), 'mmrStart')).toBe(value);
	});
});

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
