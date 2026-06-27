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
	updateWallet,
	withoutSigner
} from './wallet-api.js';

export interface RevokeModeCInput {
	walletId: string;
	/** Owner P-256 authorization key for wallet PATCH (user-owned wallet). */
	ownerAuthorizationKey: string;
	/**
	 * Mandate's key quorum id. When set, revoke is **targeted**: only mandate is
	 * removed from additional_signers and other signers are preserved.
	 */
	mandateSignerId?: string;
	/**
	 * Ops escape hatch: clear ALL additional signers instead of a targeted
	 * removal, even when mandateSignerId is provided.
	 */
	clearAllAdditionalSigners?: boolean;
	/**
	 * Sink for the deprecation warning emitted when neither mandateSignerId nor
	 * clearAllAdditionalSigners is supplied (defaults to console.warn).
	 */
	warn?: (message: string) => void;
}

/**
 * Remove mandate from a user-owned Mode C wallet's additional signers
 * (FOR-114 / I3). Targeted when mandateSignerId is provided; full clear only as
 * an explicit ops escape hatch (clearAllAdditionalSigners) or, deprecated, when
 * mandateSignerId is omitted.
 */
export async function revokeModeCWallet(
	client: PrivyRestClient,
	input: RevokeModeCInput
): Promise<RevokeModeCOutput> {
	const walletBefore = await getWallet(client, input.walletId);
	assertWalletIsUserOwned(walletBefore);

	const signersBefore = walletBefore.additional_signers ?? [];
	const hadMandateSigner = input.mandateSignerId
		? mandateListedAsAdditionalSigner(walletBefore, input.mandateSignerId)
		: signersBefore.length > 0;

	if (input.mandateSignerId && !hadMandateSigner) {
		throw new OwnerTopologyError(
			`mandate signer ${input.mandateSignerId} is not registered as an additional signer — nothing to revoke`
		);
	}

	const targeted = Boolean(input.mandateSignerId) && !input.clearAllAdditionalSigners;
	if (targeted) {
		const next = withoutSigner(signersBefore, input.mandateSignerId!);
		await updateWallet(
			client,
			input.walletId,
			{ additional_signers: next },
			input.ownerAuthorizationKey
		);
	} else {
		if (!input.mandateSignerId && !input.clearAllAdditionalSigners) {
			const warn = input.warn ?? ((message: string) => console.warn(message));
			warn(
				'revokeModeCWallet: clearing ALL additional signers because mandateSignerId was ' +
					'not provided; pass mandateSignerId for targeted revoke or clearAllAdditionalSigners ' +
					'to opt in explicitly (deprecated full-clear default)'
			);
		}
		await removeAllAdditionalSigners(client, input.walletId, input.ownerAuthorizationKey);
	}

	const walletAfter = await getWallet(client, input.walletId);
	assertMandateAbsentFromAdditionalSigners(walletAfter, input.mandateSignerId);

	return {
		walletId: input.walletId,
		walletAddress: walletAfter.address,
		additionalSignersAfter: walletAfter.additional_signers ?? [],
		revoked: hadMandateSigner,
		hadMandateSigner
	};
}
