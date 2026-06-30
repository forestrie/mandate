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

export interface ProvisionDescriptors {
	keyDirectory: Record<string, KeyDirectoryEntry>;
	operatorRootKeys: Record<string, OperatorRootKeyEntry>;
}
