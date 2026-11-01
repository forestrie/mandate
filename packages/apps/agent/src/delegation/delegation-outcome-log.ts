import { formatDecimalUint64 } from '@mandate/coordinator-types';
import type { DelegationDemand } from './delegation-demand.js';

export type DelegationOutcome =
	| 'duplicate'
	| 'signed_and_submitted'
	| 'webhook_rejected'
	| 'signer_failed'
	| 'certificate_rejected'
	| 'coordinator_rejected'
	/** Safe 1x1 (Mode D): root signs in the console; the agent never will. */
	| 'interactive_root';

/**
 * Structured per-request log for pending-delegations queue / exit audit
 * (FOR-113). The range is logged as decimal strings, the coordinator's wire
 * form (canopy plan-2611-01 D1): `JSON.stringify` throws on `bigint`, and a
 * number would round above 2^53. A window-less event logs no range.
 */
export function logDelegationOutcome(
	event: Pick<DelegationDemand, 'requestKey' | 'logId' | 'mmrStart' | 'mmrEnd'>,
	outcome: DelegationOutcome,
	detail?: Record<string, string | number | boolean>
): void {
	console.log(
		JSON.stringify({
			type: 'delegation.required.outcome',
			requestKey: event.requestKey,
			logId: event.logId,
			mmrStart: event.mmrStart === undefined ? undefined : formatDecimalUint64(event.mmrStart),
			mmrEnd: event.mmrEnd === undefined ? undefined : formatDecimalUint64(event.mmrEnd),
			outcome,
			...detail
		})
	);
}
