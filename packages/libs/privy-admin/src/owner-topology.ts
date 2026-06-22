import type { KeyQuorum } from './key-quorum.js';
import { OwnerTopologyError } from './owner-topology-error.js';
import type { Wallet } from './wallet.js';

/**
 * Fail closed if mandate's signer id is the wallet owner (ARC-0022 I2 / ADR-0005 §3).
 */
export function assertMandateNotWalletOwner(wallet: Wallet, mandateSignerId: string): void {
	const ownerId = wallet.owner_id?.trim();
	if (ownerId && ownerId === mandateSignerId) {
		throw new OwnerTopologyError(
			'mandate signer id matches wallet owner_id — prohibited owner-topology (I2)'
		);
	}
}

/**
 * After onboarding, mandate must appear only in additional_signers (not owner).
 */
export function assertMandateIsAdditionalSignerOnly(wallet: Wallet, mandateSignerId: string): void {
	assertMandateNotWalletOwner(wallet, mandateSignerId);

	const signers = wallet.additional_signers ?? [];
	const found = signers.some((s) => s.signer_id === mandateSignerId);
	if (!found) {
		throw new OwnerTopologyError(
			`mandate signer ${mandateSignerId} is not registered as an additional signer`
		);
	}

	if (wallet.owner_id === mandateSignerId) {
		throw new OwnerTopologyError('mandate signer must not be wallet owner');
	}
}

/**
 * Reject owner quorums that include mandate (ARC-0022 I2 — mandate never in owner set).
 */
export function assertOwnerQuorumExcludesMandate(quorum: KeyQuorum, mandateSignerId: string): void {
	const members = quorum.members ?? [];
	const includesMandate = members.some(
		(m) => m.key_quorum_id === mandateSignerId || m.authorization_key_id === mandateSignerId
	);
	if (includesMandate) {
		throw new OwnerTopologyError('owner quorum includes mandate signer — prohibited (ARC-0022 I2)');
	}
}

/**
 * Fail closed when the wallet has no user owner (operator app-controlled / ownerless).
 */
export function assertWalletIsUserOwned(wallet: Wallet): void {
	const ownerId = wallet.owner_id?.trim();
	if (ownerId) return;

	const owner = wallet.owner;
	const userId = owner?.user_id?.trim();
	const publicKey = owner?.public_key?.trim();
	if (userId || publicKey) return;

	throw new OwnerTopologyError(
		'wallet is ownerless — Mode C requires a user-owned wallet (ARC-0022 I2)'
	);
}

/** Combined topology check for a wallet and optional owner quorum detail. */
export function assertSignerNotOwner(
	wallet: Wallet,
	mandateSignerId: string,
	ownerQuorum?: KeyQuorum
): void {
	assertMandateNotWalletOwner(wallet, mandateSignerId);
	if (ownerQuorum) {
		assertOwnerQuorumExcludesMandate(ownerQuorum, mandateSignerId);
	}
}
