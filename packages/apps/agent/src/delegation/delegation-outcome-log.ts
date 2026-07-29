import type { DelegationRequiredEvent } from '@mandate/coordinator-types';

export type DelegationOutcome =
	| 'duplicate'
	| 'signed_and_submitted'
	| 'webhook_rejected'
	| 'signer_failed'
	| 'certificate_rejected'
	| 'coordinator_rejected'
	/** Safe 1x1 (Mode D): root signs in the console; the agent never will. */
	| 'interactive_root';

/** Structured per-request log for pending-delegations queue / exit audit (FOR-113). */
export function logDelegationOutcome(
	event: Pick<DelegationRequiredEvent, 'requestKey' | 'logId' | 'mmrStart' | 'mmrEnd'>,
	outcome: DelegationOutcome,
	detail?: Record<string, string | number | boolean>
): void {
	console.log(
		JSON.stringify({
			type: 'delegation.required.outcome',
			requestKey: event.requestKey,
			logId: event.logId,
			mmrStart: event.mmrStart,
			mmrEnd: event.mmrEnd,
			outcome,
			...detail
		})
	);
}
