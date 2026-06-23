import { describe, expect, it } from 'vitest';
import { isAllowedCoordinatorPath, isPublicCoordinatorPath } from './bff-allowlist.js';

describe('isAllowedCoordinatorPath', () => {
	it('allows pending list GET', () => {
		expect(isAllowedCoordinatorPath('GET', ['delegations', 'pending'])).toBe(true);
	});

	it('allows certificate submit POST', () => {
		expect(isAllowedCoordinatorPath('POST', ['delegations', 'certificate'])).toBe(true);
	});

	it('marks certificate submit as public', () => {
		expect(isPublicCoordinatorPath('POST', ['delegations', 'certificate'])).toBe(true);
	});

	it('allows signing route for uuid log id', () => {
		expect(
			isAllowedCoordinatorPath('GET', [
				'logs',
				'550e8400-e29b-41d4-a716-446655440000',
				'signing-route'
			])
		).toBe(true);
	});

	it('allows delegation enabled GET and PUT', () => {
		const logId = '550e8400-e29b-41d4-a716-446655440000';
		expect(isAllowedCoordinatorPath('GET', ['logs', logId, 'enabled'])).toBe(true);
		expect(isAllowedCoordinatorPath('PUT', ['logs', logId, 'enabled'])).toBe(true);
	});

	it('rejects unknown paths', () => {
		expect(isAllowedCoordinatorPath('GET', ['delegations', 'issue'])).toBe(false);
	});

	it('rejects custody keys (operator-only)', () => {
		expect(
			isAllowedCoordinatorPath('POST', [
				'logs',
				'550e8400-e29b-41d4-a716-446655440000',
				'custody-keys'
			])
		).toBe(false);
	});
});
