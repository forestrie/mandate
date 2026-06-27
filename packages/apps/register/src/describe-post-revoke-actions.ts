import type { KeyDirectoryEntry } from './key-directory-entry.js';

/** KEY_DIRECTORY shape: keyRef → signer descriptor (matches signer Worker). */
export type KeyDirectoryMap = Record<string, KeyDirectoryEntry>;

export interface PostRevokeActionsInput {
	walletId: string;
	keyRef: string;
	keyDirectory: KeyDirectoryMap;
}

/** Operator-facing checklist describing how to retire a revoked wallet's keys. */
export interface PostRevokeActions {
	walletId: string;
	keyRef: string;
	keyDirectoryEntryToRemove: KeyDirectoryEntry;
	/** Operator root key addresses that become orphaned once the entry is removed. */
	operatorRootKeysAffected: string[];
	/** KEY_DIRECTORY with the revoked keyRef pruned — paste back into Doppler. */
	emitUpdatedKeyDirectory: KeyDirectoryMap;
	wranglerHints: string[];
	expectedAgentBehavior: string;
}

export class PostRevokeActionsError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'PostRevokeActionsError';
	}
}

/**
 * Compute the post-revoke operator checklist for a wallet whose mandate signer
 * was revoked at Privy (FOR-131). Pure: no I/O, no Cloudflare mutation. The
 * caller decides whether to apply the emitted KEY_DIRECTORY.
 */
export function describePostRevokeActions(input: PostRevokeActionsInput): PostRevokeActions {
	const entry = input.keyDirectory[input.keyRef];
	if (!entry) {
		throw new PostRevokeActionsError(`keyRef "${input.keyRef}" not found in KEY_DIRECTORY`);
	}
	if (entry.walletId !== input.walletId) {
		throw new PostRevokeActionsError(
			`keyRef "${input.keyRef}" maps to wallet ${entry.walletId}, not ${input.walletId}`
		);
	}

	const emitUpdatedKeyDirectory: KeyDirectoryMap = {};
	for (const [ref, value] of Object.entries(input.keyDirectory)) {
		if (ref !== input.keyRef) {
			emitUpdatedKeyDirectory[ref] = value;
		}
	}

	return {
		walletId: input.walletId,
		keyRef: input.keyRef,
		keyDirectoryEntryToRemove: entry,
		operatorRootKeysAffected: [entry.rootSignerAddress],
		emitUpdatedKeyDirectory,
		wranglerHints: [
			`Remove "${input.keyRef}" from KEY_DIRECTORY in Doppler (mandate config).`,
			'Update the signer Worker secret with the pruned directory, e.g.:',
			"  printf '%s' '<updated KEY_DIRECTORY json>' | " +
				'wrangler secret put KEY_DIRECTORY --name mandate-signer'
		],
		expectedAgentBehavior:
			'Until the signer KEY_DIRECTORY secret is updated the signer rejects RPC ' +
			'(Privy 401/403) and the agent fails closed with 502 on sign for this logId; ' +
			'the coordinator may retry. This is the expected state after a custody revoke.'
	};
}
