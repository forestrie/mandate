import { describe, expect, it } from 'vitest';
import {
	isValidLogIdHex32,
	MAX_SIG_STRUCTURE_B64_LENGTH,
	timingSafeEqualString
} from '../src/auth.js';

describe('auth helpers', () => {
	it('timingSafeEqualString accepts equal strings', () => {
		expect(timingSafeEqualString('Bearer abc', 'Bearer abc')).toBe(true);
	});

	it('timingSafeEqualString rejects unequal strings', () => {
		expect(timingSafeEqualString('Bearer abc', 'Bearer abd')).toBe(false);
		expect(timingSafeEqualString('Bearer abc', 'Bearer ab')).toBe(false);
	});

	it('validates 32-char hex logId', () => {
		expect(isValidLogIdHex32('b2c3d4e5f67890ab1234567890abcdef')).toBe(true);
		expect(isValidLogIdHex32('not-hex')).toBe(false);
		expect(isValidLogIdHex32('abc')).toBe(false);
	});

	it('defines sigStructure base64 cap', () => {
		expect(MAX_SIG_STRUCTURE_B64_LENGTH).toBeGreaterThan(0);
	});
});
