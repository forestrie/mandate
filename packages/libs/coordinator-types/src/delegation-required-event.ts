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
	 */
	mmrStart?: number;
	mmrEnd?: number;
	delegatedPublicKey: string;
	requestedAt: number;
	certificateSubmitUrl: string;
	/** @deprecated use certificateSubmitUrl */
	materialSubmitUrl?: string;
}
