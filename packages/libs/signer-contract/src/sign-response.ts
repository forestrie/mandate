/** ADR-0003 POST /v1/sign success response. */
export interface SignResponse {
	/** Base64-encoded 65-byte recoverable secp256k1 signature (r||s||v). */
	signature: string;
}
