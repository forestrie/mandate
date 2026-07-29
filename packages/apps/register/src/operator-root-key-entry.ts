/**
 * How the agent reaches (or refuses to reach) the root signer for a log.
 * `remote` posts Sig_structures to a signer service; `interactive` is the
 * Safe 1x1 (Mode D) shape — the root signs in the console, the agent has no
 * signing route at all (ADR-0005 addendum 2026-07-29).
 */
export type OperatorRootKeySignerKind = 'remote' | 'interactive';

/** OPERATOR_ROOT_KEYS descriptor (agent Worker secret). */
export interface OperatorRootKeyEntry {
	alg: 'KS256';
	rootSignerAddress: string;
	kind: OperatorRootKeySignerKind;
	/** Signer `POST /v1/sign` URL — required for `remote`, forbidden for `interactive`. */
	signerUrl?: string;
	/** Signer key directory ref — required for `remote`, absent for `interactive`. */
	keyRef?: string;
	bearerEnvKey?: string;
	/**
	 * Config-version stamp (crypto UUID) written on every exit-to-mode-b put and
	 * echoed by the agent's GET /ops/root-key-config so callers can observe the
	 * put propagating to the deployed Worker (FOR-311 S1).
	 */
	configNonce?: string;
}
