import { describe, expect, it } from 'vitest';
import { isAllowedCoordinatorPath } from './bff-proxy.js';

describe('isAllowedCoordinatorPath', () => {
	it('allows pending list GET', () => {
		expect(isAllowedCoordinatorPath('GET', ['delegations', 'pending'])).toBe(true);
	});

	it('allows material submit POST', () => {
		expect(isAllowedCoordinatorPath('POST', ['delegations', 'material'])).toBe(true);
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

	it('rejects custody keys by default', () => {
		expect(
			isAllowedCoordinatorPath('POST', [
				'logs',
				'550e8400-e29b-41d4-a716-446655440000',
				'custody-keys'
			])
		).toBe(false);
	});
});
