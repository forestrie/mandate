/** Additional signer on a Privy wallet with optional override policy. */
export interface WalletAdditionalSignerItem {
	signer_id: string;
	override_policy_ids?: string[];
}
