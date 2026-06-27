/** OPERATOR_ROOT_KEYS remote descriptor (agent Worker secret). */
export interface OperatorRootKeyEntry {
	alg: 'KS256';
	rootSignerAddress: string;
	kind: 'remote';
	signerUrl: string;
	keyRef: string;
	bearerEnvKey?: string;
}
