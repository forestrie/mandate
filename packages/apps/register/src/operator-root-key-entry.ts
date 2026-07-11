/** OPERATOR_ROOT_KEYS remote descriptor (agent Worker secret). */
export interface OperatorRootKeyEntry {
	alg: 'KS256';
	rootSignerAddress: string;
	kind: 'remote';
	signerUrl: string;
	keyRef: string;
	bearerEnvKey?: string;
	/**
	 * Config-version stamp (crypto UUID) written on every exit-to-mode-b put and
	 * echoed by the agent's GET /ops/root-key-config so callers can observe the
	 * put propagating to the deployed Worker (FOR-311 S1).
	 */
	configNonce?: string;
}
