/** KEY_DIRECTORY entry for a Mode C user log wallet. */
export interface ModeCKeyDirectoryEntry {
	walletId: string;
	rootSignerAddress: string;
	logIds: string[];
	requiresAuthorizationSignature: true;
}

/** OPERATOR_ROOT_KEYS remote descriptor for Mode C hands-off sealing. */
export interface ModeCOperatorRootKeyEntry {
	alg: 'KS256';
	rootSignerAddress: string;
	kind: 'remote';
	signerUrl: string;
	keyRef: string;
}

/** Output of Mode C onboarding — paste into worker secrets. */
export interface ModeCOnboardOutput {
	walletId: string;
	walletAddress: string;
	policyId: string;
	keyRef: string;
	logId: string;
	keyDirectory: Record<string, ModeCKeyDirectoryEntry>;
	operatorRootKeys: Record<string, ModeCOperatorRootKeyEntry>;
}
