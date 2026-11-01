/** Pending delegation hint awaiting material submission. */
export interface PendingEntry {
	id: string;
	authLogIdHex32: string;
	logIdHex32: string;
	/** Range start (inclusive). Canonical decimal uint64 string (plan-2611-01 D1); parse with `parseDecimalUint64`. */
	mmrStart: string;
	/** Range end (inclusive). Canonical decimal uint64 string (plan-2611-01 D1); parse with `parseDecimalUint64`. */
	mmrEnd: string;
	delegatedPublicKeyHash: string;
	/** Base64-encoded delegated public key CBOR bytes. */
	delegatedPublicKey: string;
	requestedAt: number;
}
