import { describe, expect, it, vi } from 'vitest';
import { logDelegationOutcome } from '../src/delegation/delegation-outcome-log.js';

describe('logDelegationOutcome', () => {
	it('emits structured JSON without secrets', () => {
		const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
		logDelegationOutcome(
			{
				requestKey: 'rk-1',
				logId: 'a'.repeat(32),
				mmrStart: 1n,
				mmrEnd: (1n << 64n) - 1n
			},
			'signed_and_submitted'
		);
		expect(spy).toHaveBeenCalledOnce();
		const line = String(spy.mock.calls[0]?.[0]);
		const parsed = JSON.parse(line) as Record<string, unknown>;
		expect(parsed.type).toBe('delegation.required.outcome');
		expect(parsed.outcome).toBe('signed_and_submitted');
		expect(parsed.requestKey).toBe('rk-1');
		// JSON.stringify throws on bigint; the range is logged as the same
		// decimal strings the coordinator sends.
		expect(parsed.mmrStart).toBe('1');
		expect(parsed.mmrEnd).toBe('18446744073709551615');
		spy.mockRestore();
	});

	it('omits the range for a window-less event', () => {
		const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
		logDelegationOutcome({ requestKey: 'rk-2', logId: 'b'.repeat(32) }, 'duplicate');
		const parsed = JSON.parse(String(spy.mock.calls[0]?.[0])) as Record<string, unknown>;
		expect(parsed).not.toHaveProperty('mmrStart');
		expect(parsed).not.toHaveProperty('mmrEnd');
		spy.mockRestore();
	});
});
