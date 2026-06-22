export type SignerKind = 'local' | 'remote';

/** Per-log operator root signing configuration (no private key material in remote mode). */
export interface LogSignerDescriptor {
	alg: 'KS256';
	rootSignerAddress: string;
	kind: SignerKind;
	privateKeyHex?: string;
	signerUrl?: string;
}
