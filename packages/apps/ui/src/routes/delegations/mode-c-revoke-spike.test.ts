import { describe, expect, it } from 'vitest';
import {
	BROWSER_CUSTODY_REVOKE_VIABLE,
	KILL_SWITCH_RUNBOOK_URL,
	killSwitchGuidance
} from './mode-c-revoke-spike.js';

describe('mode-c-revoke-spike', () => {
	it('records negative browser custody revoke spike (FOR-197)', () => {
		expect(BROWSER_CUSTODY_REVOKE_VIABLE).toBe(false);
		const guidance = killSwitchGuidance();
		expect(guidance.custodyBody).toContain('authorization key');
		expect(guidance.custodyBody).not.toMatch(/revoke in the browser/i);
		expect(guidance.custodyCliCommand).toBe('task privy:revoke:mode-c');
		expect(KILL_SWITCH_RUNBOOK_URL).toContain('adr-0005');
	});
});
