/** JSON body for POST /api/delegations/certificate. */
export interface SubmitDelegationCertificateRequest {
	logId: string;
	/** Range start (inclusive). Canonical decimal uint64 string (plan-2611-01 D1); parse with `parseDecimalUint64`. */
	mmrStart: string;
	/** Range end (inclusive). Canonical decimal uint64 string (plan-2611-01 D1); parse with `parseDecimalUint64`. */
	mmrEnd: string;
	/** Base64-encoded delegated public key CBOR bytes */
	delegatedPublicKey: string;
	/** Base64-encoded delegation certificate |certificate| COSE Sign1 bytes */
	certificate: string;
	issuedAt: number;
	expiresAt: number;
}
