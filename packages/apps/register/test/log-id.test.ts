import { describe, expect, it } from 'vitest';
import { logIdFromR, logIdHex32ToBytes, normalizeForestR, rFromLogIdHex32 } from '../src/log-id.js';

describe('log id wire helpers', () => {
	const dashed = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
	const hex32 = 'a1b2c3d4e5f67890abcdef1234567890';

	it('converts dashed UUID to 32-hex log id', () => {
		expect(logIdFromR(dashed)).toBe(hex32);
	});

	it('converts 32-hex log id to dashed UUID', () => {
		expect(rFromLogIdHex32(hex32)).toBe(dashed);
	});

	it('round-trips through 16-byte UUID bytes', () => {
		const bytes = logIdHex32ToBytes(hex32);
		expect(bytes.length).toBe(16);
		expect(logIdFromR(rFromLogIdHex32(hex32))).toBe(hex32);
	});

	it('normalizes forest R to lowercase dashed UUID', () => {
		expect(normalizeForestR('A1B2C3D4-E5F6-7890-ABCD-EF1234567890')).toBe(dashed);
	});
});
