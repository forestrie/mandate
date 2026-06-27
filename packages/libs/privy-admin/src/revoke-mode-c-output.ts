import type { WalletAdditionalSignerItem } from './wallet-additional-signer.js';

/** Output of Mode C kill switch — mandate removed from additional_signers. */
export interface RevokeModeCOutput {
	walletId: string;
	walletAddress: string;
	/**
	 * Additional signers remaining after revoke. Empty after a full clear; for a
	 * targeted revoke this lists the signers preserved alongside mandate's removal.
	 */
	additionalSignersAfter: WalletAdditionalSignerItem[];
	/** True when mandate was present before revoke and PATCH succeeded. */
	revoked: boolean;
	/** True when mandateSignerId was listed in additional_signers before revoke. */
	hadMandateSigner: boolean;
}
