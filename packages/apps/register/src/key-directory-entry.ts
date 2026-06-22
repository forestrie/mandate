/** KEY_DIRECTORY entry emitted by provisioning (signer Worker secret). */
export interface KeyDirectoryEntry {
	walletId: string;
	rootSignerAddress: string;
	logIds: string[];
	requiresAuthorizationSignature?: boolean;
}
