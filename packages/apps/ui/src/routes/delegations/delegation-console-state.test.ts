import { describe, expect, it } from 'vitest';
import type { EnabledResponse } from '@mandate/coordinator-types';
import {
	enabledBadgeLabels,
	effectiveEnabledVariant,
	matchesStatusFilter,
	reconcileRowStatus
} from './delegation-console-state.js';

describe('enabledBadgeLabels', () => {
	it('maps EnabledResponse to user/operator/effective labels', () => {
		const response: EnabledResponse = {
			enabled: true,
			userEnabled: true,
			operatorEnabled: false
		};
		expect(enabledBadgeLabels(response)).toEqual({
			user: 'User on',
			operator: 'Operator paused',
			effective: 'Signing active'
		});
		expect(effectiveEnabledVariant(response.enabled)).toBe('default');
		expect(effectiveEnabledVariant(false)).toBe('outline');
	});
});

describe('reconcileRowStatus', () => {
	it('marks rows no longer pending as submitted when previously signed', () => {
		const stored = {
			'entry-1': 'signed' as const,
			'entry-2': 'pending' as const,
			'entry-old': 'signed' as const
		};
		const reconciled = reconcileRowStatus(stored, ['entry-1', 'entry-2']);
		expect(reconciled['entry-1']).toBe('signed');
		expect(reconciled['entry-2']).toBe('pending');
		expect(reconciled['entry-old']).toBe('submitted');
	});

	it('resets signing to pending on reload', () => {
		const reconciled = reconcileRowStatus({ 'entry-1': 'signing' }, ['entry-1']);
		expect(reconciled['entry-1']).toBe('pending');
	});
});

describe('matchesStatusFilter', () => {
	it('treats submitted like signed in signed filter', () => {
		expect(matchesStatusFilter('submitted', 'signed')).toBe(true);
		expect(matchesStatusFilter('pending', 'signed')).toBe(false);
	});
});
