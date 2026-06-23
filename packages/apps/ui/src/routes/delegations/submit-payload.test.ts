import { describe, expect, it } from 'vitest';
import type { PendingEntry } from '@mandate/coordinator-types';
import { buildSubmitMaterialBody } from './submit-payload.js';

const ZERO_BYTES_B64 = Buffer.alloc(32).toString('base64');

function pendingEntry(overrides: Partial<PendingEntry> = {}): PendingEntry {
	return {
		id: 'pending-1',
		authLogIdHex32: 'a'.repeat(32),
		logIdHex32: 'b'.repeat(32),
		mmrStart: 0,
		mmrEnd: 4,
		delegatedPublicKeyHash: 'hash',
		delegatedPublicKey: 'ZGVsZWdhdGVkLWtleQ==',
		requestedAt: 1_700_000_000,
		...overrides
	};
}

describe('buildSubmitMaterialBody', () => {
	it('uses entry.delegatedPublicKey, not zero bytes', () => {
		const entry = pendingEntry({ delegatedPublicKey: 'ZGVsZWdhdGVkLWtleQ==' });
		const body = buildSubmitMaterialBody(entry, 'cert-bytes', 1_700_000_100);

		expect(body.delegatedPublicKey).toBe(entry.delegatedPublicKey);
		expect(body.delegatedPublicKey).not.toBe(ZERO_BYTES_B64);
		expect(body.logId).toBe(entry.logIdHex32);
		expect(body.mmrStart).toBe(entry.mmrStart);
		expect(body.mmrEnd).toBe(entry.mmrEnd);
		expect(body.certificate).toBe('cert-bytes');
		expect(body.issuedAt).toBe(1_700_000_100);
		expect(body.expiresAt).toBe(1_700_000_100 + 86400);
	});
});
