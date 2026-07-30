/** Pluggable signing backend for delegation material (EOA vs Safe). */
export interface SigningBackend {
	readonly kind: 'eoa' | 'safe';
	isAvailable(): boolean;
	/**
	 * Sign keccak256(Sig_structure) and return the 65-byte wire signature that
	 * goes into the COSE envelope VERBATIM. Each backend owns its own
	 * normalisation: EOA backends return the recoverable `r‖s‖v` blob
	 * normalised to low-S with v ∈ {0,1} (what ecrecover-style verifiers
	 * expect); the Safe backend returns the owner's EIP-712 SafeMessage
	 * signature with v ∈ {27,28} UNTOUCHED — rewriting v to 0/1 would make the
	 * Safe read it as a contract-signature / approved-hash flavour and reject
	 * it inside `isValidSignature`.
	 */
	signKs256SigStructure(sigStructureBytes: Uint8Array): Promise<Uint8Array>;
}

export class SigningBackendUnavailableError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'SigningBackendUnavailableError';
	}
}

export class SigningNotImplementedError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'SigningNotImplementedError';
	}
}
