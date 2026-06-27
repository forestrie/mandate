/** Spike outcome for FOR-197 — browser custody revoke feasibility. */

export const BROWSER_CUSTODY_REVOKE_VIABLE = false as const;

export const KILL_SWITCH_RUNBOOK_URL =
	'https://github.com/forestrie/mandate/blob/main/docs/adr/adr-0005-byok-delegation-modes.md#operational-appendix--mode-c-kill-switch-and-exits-for-114';

export interface KillSwitchGuidance {
	coordinatorTitle: string;
	coordinatorBody: string;
	custodyTitle: string;
	custodyBody: string;
	custodyCliCommand: string;
}

export function killSwitchGuidance(): KillSwitchGuidance {
	return {
		coordinatorTitle: 'Coordinator (in-browser, wallet session)',
		coordinatorBody:
			'Pause or resume webhook signing for a user log using your connected wallet and logs:enabled:write. Stops new delegation.required delivery at the coordinator.',
		custodyTitle: 'Privy custody (operator-assisted CLI)',
		custodyBody: BROWSER_CUSTODY_REVOKE_VIABLE
			? 'Revoke mandate as an additional signer in the browser.'
			: 'Removing mandate as an additional signer requires the wallet owner authorization key. Use the CLI below; mandate never holds this key in the browser or BFF (ARC-0022 I3).',
		custodyCliCommand: 'task privy:revoke:mode-c'
	};
}
