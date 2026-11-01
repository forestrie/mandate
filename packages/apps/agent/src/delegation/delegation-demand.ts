import type { DelegationRequiredEvent } from '@mandate/coordinator-types';

/**
 * A `delegation.required` webhook event after edge parsing: the demanded
 * window is `bigint` (parsed from the coordinator's decimal strings) and
 * the submit URL is resolved. Both bounds are
 * present (`mmrStart <= mmrEnd`) or both absent (the window-less standing
 * delegate-key delivery, ADR-0050 §2).
 */
export interface DelegationDemand extends Omit<
	DelegationRequiredEvent,
	'mmrStart' | 'mmrEnd' | 'certificateSubmitUrl'
> {
	mmrStart?: bigint;
	mmrEnd?: bigint;
	certificateSubmitUrl: string;
}
