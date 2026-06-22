/** ADR-0003 POST /v1/sign request body. */
export interface SignRequest {
	logId: string;
	keyRef: string;
	rootSignerAddress: string;
	/** Base64-encoded COSE Sig_structure bytes. */
	sigStructure: string;
}
