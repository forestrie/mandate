/**
 * `local` and `remote` resolve to an agent-side signer. `interactive` is the
 * Safe 1x1 (Mode D) shape (ADR-0005 addendum): the root signs in the console
 * only — the agent NEVER signs for these logs, and the coordinator's pending
 * queue (signing-route) holds delegation demands until the owner signs.
 */
export type SignerKind = 'local' | 'remote' | 'interactive';

/** Per-log operator root signing configuration (no private key material in remote mode). */
export interface LogSignerDescriptor {
	alg: 'KS256';
	rootSignerAddress: string;
	kind: SignerKind;
	privateKeyHex?: string;
	signerUrl?: string;
	/** Opaque signer key id for ADR-0003 remote signing (required when kind=remote). */
	keyRef?: string;
	/** Agent env var name for Bearer auth when kind=remote (Mode B). */
	bearerEnvKey?: string;
	/**
	 * Opaque config-version stamp written by `mandate-register privy
	 * exit-to-mode-b` on every OPERATOR_ROOT_KEYS put and echoed by
	 * GET /ops/root-key-config (FOR-311 S1). Absent on maps written before the
	 * stamp existed — readers must tolerate that.
	 */
	configNonce?: string;
}
