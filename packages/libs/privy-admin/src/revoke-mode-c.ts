import type { RevokeModeCOutput } from './revoke-mode-c-output.js';
import { OwnerTopologyError } from './owner-topology-error.js';
import {
	assertMandateAbsentFromAdditionalSigners,
	assertWalletIsUserOwned,
	mandateListedAsAdditionalSigner
} from './owner-topology.js';
import type { PrivyRestClient } from './privy-rest.js';
import {
	getWallet,
	removeAllAdditionalSigners,
	removeMandateAdditionalSigner
} from './wallet-api.js';

export interface RevokeModeCInput {
	walletId: string;
	/** Owner P-256 authorization key for wallet PATCH (user-owned wallet). */
	ownerAuthorizationKey: string;
	/**
	 * Mandate's key quorum id. Required for all revoke paths — used for targeted
	 * removal and for post-revoke mandate-absent verification.
	 */
	mandateSignerId: string;
	/**
	 * Ops escape hatch: clear ALL additional signers instead of a targeted
	 * removal. Still requires mandateSignerId and runs owner-topology checks.
	 */
	clearAllAdditionalSigners?: boolean;
}

/**
 * Remove mandate from a user-owned Mode C wallet's additional signers
 * (FOR-114 / I3). Targeted by default; full clear only when
 * clearAllAdditionalSigners is true.
 */
export async function revokeModeCWallet(
	client: PrivyRestClient,
	input: RevokeModeCInput
): Promise<RevokeModeCOutput> {
	const walletBefore = await getWallet(client, input.walletId);
	assertWalletIsUserOwned(walletBefore);

	const hadMandateSigner = mandateListedAsAdditionalSigner(walletBefore, input.mandateSignerId);

	if (!hadMandateSigner) {
		throw new OwnerTopologyError(
			`mandate signer ${input.mandateSignerId} is not registered as an additional signer — nothing to revoke`
		);
	}

	if (input.clearAllAdditionalSigners) {
		await removeAllAdditionalSigners(client, input.walletId, input.ownerAuthorizationKey);
	} else {
		await removeMandateAdditionalSigner(
			client,
			input.walletId,
			input.mandateSignerId,
			input.ownerAuthorizationKey,
			walletBefore
		);
	}

	const walletAfter = await getWallet(client, input.walletId);
	assertMandateAbsentFromAdditionalSigners(walletAfter, input.mandateSignerId);

	return {
		walletId: input.walletId,
		walletAddress: walletAfter.address,
		additionalSignersAfter: walletAfter.additional_signers ?? [],
		revoked: hadMandateSigner,
		hadMandateSigner,
		action: input.clearAllAdditionalSigners ? 'full-clear' : 'targeted'
	};
}
