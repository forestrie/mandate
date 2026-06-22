export type SignerKind = 'local' | 'remote';

/** Per-log operator root signing configuration (no private key material in remote mode). */
export interface LogSignerDescriptor {
	alg: 'KS256';
	rootSignerAddress: string;
	kind: SignerKind;
	privateKeyHex?: string;
	signerUrl?: string;
	/** Opaque signer key id for ADR-0003 remote signing (required when kind=remote). */
	keyRef?: string;
}
