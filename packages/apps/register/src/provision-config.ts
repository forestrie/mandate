import type { DelegationMode } from './delegation-mode.js';
import type { KeyDirectoryEntry } from './key-directory-entry.js';
import type { OperatorRootKeyEntry } from './operator-root-key-entry.js';
import type { UnivocityGenesisVariant } from './univocity-genesis-variant.js';

/** Operator inputs for instance provisioning (FOR-100). */
export interface ProvisionConfig {
	onboardToken: string;
	canopyBaseUrl: string;
	coordinatorBaseUrl: string;
	agentWebhookUrl: string;
	mode: DelegationMode;
	univocityAddr: string;
	chainId: string;
	univocityVariant?: UnivocityGenesisVariant;
	/** CREATE3 deployer address for uups-counterfactual genesis (-68017). */
	univocityDeployer?: string;
	/** Forest genesis path segment; generated when omitted. */
	forestR?: string;
	fetchImpl?: typeof fetch;
	modeC?: ModeCProvisionInputs;
	/** Mode B user remote signer (descriptor only; full routing FOR-111). */
	modeB?: ModeBProvisionInputs;
	/** Safe 1x1 (Mode D) interactive root (ADR-0005 addendum, plan-2607-45). */
	modeD?: ModeDProvisionInputs;
}

export interface ModeCProvisionInputs {
	appId: string;
	appSecret: string;
	apiBase: string;
	walletId: string;
	mandateSignerId: string;
	ownerAuthorizationKey: string;
	signerUrl: string;
	keyRef?: string;
	policyId?: string;
}

export interface ModeBProvisionInputs {
	rootSignerAddress: string;
	userSignerUrl: string;
	keyRef: string;
}

/**
 * Safe 1x1 (Mode D): the log root authority is a 1-of-1 Safe contract
 * account. Genesis takes the bare Safe address as the KS256 bootstrapKey
 * (ERC-1271 verification, univocity plan-0029 — no new COSE alg). There is
 * no signer service and no custody client: the sole owner signs
 * interactively in the console, so the emitted descriptor is
 * `kind: 'interactive'` with NO signerUrl.
 */
export interface ModeDProvisionInputs {
	/** 1-of-1 Safe contract address (0x…) — the log's root authority K(L). */
	safeAddress: string;
}

export interface ProvisionDescriptors {
	keyDirectory: Record<string, KeyDirectoryEntry>;
	operatorRootKeys: Record<string, OperatorRootKeyEntry>;
}
