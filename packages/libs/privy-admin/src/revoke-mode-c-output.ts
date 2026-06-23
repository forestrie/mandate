/** Output of Mode C kill switch — mandate removed from additional_signers. */
export interface RevokeModeCOutput {
	walletId: string;
	walletAddress: string;
	additionalSignersAfter: [];
	/** True when mandate was present before revoke and PATCH succeeded. */
	revoked: boolean;
	/** True when mandateSignerId was listed in additional_signers before revoke. */
	hadMandateSigner: boolean;
}
