/** JSON body for POST pending hint (DO internal and worker). */
export interface PendingHintRequest {
	authLogId: string;
	logId: string;
	/** Range start (inclusive). Canonical decimal uint64 string (plan-2611-01 D1); parse with `parseDecimalUint64`. */
	mmrStart: string;
	/** Range end (inclusive). Canonical decimal uint64 string (plan-2611-01 D1); parse with `parseDecimalUint64`. */
	mmrEnd: string;
	/** Base64-encoded delegated public key CBOR bytes */
	delegatedPublicKey: string;
}
