import { createDelegationSigningPolicy } from './policy.js';
import type { ModeCOnboardOutput } from './mode-c-onboard-output.js';
import { assertSignerNotOwner, assertMandateIsAdditionalSignerOnly } from './owner-topology.js';
import type { PrivyRestClient } from './privy-rest.js';
import { getKeyQuorum, getWallet, mergeAdditionalSigner, updateWallet } from './wallet-api.js';

export interface OnboardModeCInput {
	walletId: string;
	/** Privy key quorum id for mandate's additional-signer authorization key. */
	mandateSignerId: string;
	keyRef: string;
	logId: string;
	signerUrl: string;
	/** Owner P-256 authorization key for wallet PATCH (user-owned wallet). */
	ownerAuthorizationKey: string;
	/** Optional existing policy id; when omitted a delegation policy is created. */
	policyId?: string;
	policyName?: string;
}

/**
 * Attach mandate as additional signer with delegation-signing policy and emit
 * KEY_DIRECTORY + OPERATOR_ROOT_KEYS snippets (FOR-112).
 */
export async function onboardModeCWallet(
	client: PrivyRestClient,
	input: OnboardModeCInput
): Promise<ModeCOnboardOutput> {
	const walletBefore = await getWallet(client, input.walletId);
	assertSignerNotOwner(walletBefore, input.mandateSignerId);

	if (walletBefore.owner_id) {
		try {
			const ownerQuorum = await getKeyQuorum(client, walletBefore.owner_id);
			assertSignerNotOwner(walletBefore, input.mandateSignerId, ownerQuorum);
		} catch {
			// Non-quorum owner_id (e.g. user) — owner_id mismatch check above suffices.
		}
	}

	const policyId =
		input.policyId ?? (await createDelegationSigningPolicy(client, input.policyName)).id;

	const additionalSigners = mergeAdditionalSigner(walletBefore.additional_signers, {
		signer_id: input.mandateSignerId,
		override_policy_ids: [policyId]
	});

	const walletAfter = await updateWallet(
		client,
		input.walletId,
		{ additional_signers: additionalSigners },
		input.ownerAuthorizationKey
	);

	assertMandateIsAdditionalSignerOnly(walletAfter, input.mandateSignerId);

	const keyDirectoryEntry = {
		walletId: input.walletId,
		rootSignerAddress: walletAfter.address,
		logIds: [input.logId],
		requiresAuthorizationSignature: true as const
	};

	const operatorEntry = {
		alg: 'KS256' as const,
		rootSignerAddress: walletAfter.address,
		kind: 'remote' as const,
		signerUrl: input.signerUrl,
		keyRef: input.keyRef
	};

	return {
		walletId: input.walletId,
		walletAddress: walletAfter.address,
		policyId,
		keyRef: input.keyRef,
		logId: input.logId,
		keyDirectory: { [input.keyRef]: keyDirectoryEntry },
		operatorRootKeys: { [input.logId]: operatorEntry }
	};
}
