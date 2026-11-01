/** Outbound `delegation.required` webhook payload (v1). */
export interface DelegationRequiredEvent {
	requestKey: string;
	type: 'delegation.required';
	version: 1;
	logId: string;
	authLogId: string;
	/**
	 * Demanded MMR window, inclusive. Omitted on the window-less standing
	 * delegate-key delivery (ADR-0050 §2): the signer chooses its bounds.
	 * Each bound is a canonical decimal uint64 string:
	 * parse with `parseDecimalUint64`, never as a JS number.
	 */
	mmrStart?: string;
	mmrEnd?: string;
	delegatedPublicKey: string;
	requestedAt: number;
	certificateSubmitUrl: string;
	/** @deprecated use certificateSubmitUrl */
	materialSubmitUrl?: string;
}
