import { describe, expect, it, vi } from 'vitest';
import { logDelegationOutcome } from '../src/delegation/delegation-outcome-log.js';

describe('logDelegationOutcome', () => {
	it('emits structured JSON without secrets', () => {
		const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
		logDelegationOutcome(
			{
				requestKey: 'rk-1',
				logId: 'a'.repeat(32),
				mmrStart: 1,
				mmrEnd: 8
			},
			'signed_and_submitted'
		);
		expect(spy).toHaveBeenCalledOnce();
		const line = String(spy.mock.calls[0]?.[0]);
		const parsed = JSON.parse(line) as Record<string, unknown>;
		expect(parsed.type).toBe('delegation.required.outcome');
		expect(parsed.outcome).toBe('signed_and_submitted');
		expect(parsed.requestKey).toBe('rk-1');
		spy.mockRestore();
	});
});
