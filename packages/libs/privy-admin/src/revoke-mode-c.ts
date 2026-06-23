import type { RevokeModeCOutput } from './revoke-mode-c-output.js';
import { OwnerTopologyError } from './owner-topology-error.js';
import {
	assertMandateAbsentFromAdditionalSigners,
	assertWalletIsUserOwned,
	mandateListedAsAdditionalSigner
} from './owner-topology.js';
import type { PrivyRestClient } from './privy-rest.js';
import { getWallet, removeAllAdditionalSigners } from './wallet-api.js';

export interface RevokeModeCInput {
	walletId: string;
	/** Owner P-256 authorization key for wallet PATCH (user-owned wallet). */
	ownerAuthorizationKey: string;
	/** When set, post-revoke check fails if mandate signer id is still listed. */
	mandateSignerId?: string;
}

/**
 * Remove all additional signers from a user-owned Mode C wallet (FOR-114 / I3).
 */
export async function revokeModeCWallet(
	client: PrivyRestClient,
	input: RevokeModeCInput
): Promise<RevokeModeCOutput> {
	const walletBefore = await getWallet(client, input.walletId);
	assertWalletIsUserOwned(walletBefore);

	const hadMandateSigner = input.mandateSignerId
		? mandateListedAsAdditionalSigner(walletBefore, input.mandateSignerId)
		: (walletBefore.additional_signers ?? []).length > 0;

	if (input.mandateSignerId && !hadMandateSigner) {
		throw new OwnerTopologyError(
			`mandate signer ${input.mandateSignerId} is not registered as an additional signer — nothing to revoke`
		);
	}

	await removeAllAdditionalSigners(client, input.walletId, input.ownerAuthorizationKey);

	const walletAfter = await getWallet(client, input.walletId);
	assertMandateAbsentFromAdditionalSigners(walletAfter, input.mandateSignerId);

	return {
		walletId: input.walletId,
		walletAddress: walletAfter.address,
		additionalSignersAfter: [],
		revoked: hadMandateSigner,
		hadMandateSigner
	};
}
