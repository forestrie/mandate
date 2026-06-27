import type { KeyDirectoryEntry } from './key-directory-entry.js';
import type { OperatorRootKeyEntry } from './operator-root-key-entry.js';

/** KEY_DIRECTORY shape: keyRef → signer descriptor (matches signer Worker). */
export type KeyDirectoryMap = Record<string, KeyDirectoryEntry>;

/** OPERATOR_ROOT_KEYS shape: logId → remote descriptor (matches agent Worker). */
export type OperatorRootKeysMap = Record<string, OperatorRootKeyEntry>;

export interface PostRevokeActionsInput {
	walletId: string;
	keyRef: string;
	keyDirectory: KeyDirectoryMap;
	/** Optional OPERATOR_ROOT_KEYS JSON for orphan logId pruning hints (FOR-194). */
	operatorRootKeys?: OperatorRootKeysMap;
}

/** Operator-facing checklist describing how to retire a revoked wallet's keys. */
export interface PostRevokeActions {
	walletId: string;
	keyRef: string;
	keyDirectoryEntryToRemove: KeyDirectoryEntry;
	/** Operator root key addresses that become orphaned once the entry is removed. */
	operatorRootKeysAffected: string[];
	/** logIds from the removed entry with no remaining KEY_DIRECTORY owner. */
	logIdsOrphaned: string[];
	/** OPERATOR_ROOT_KEYS entries to remove when logIdsOrphaned (same keyRef). */
	operatorRootKeysEntriesToRemove: Record<string, OperatorRootKeyEntry>;
	/** KEY_DIRECTORY with the revoked keyRef pruned — paste back into Doppler. */
	emitUpdatedKeyDirectory: KeyDirectoryMap;
	/** OPERATOR_ROOT_KEYS with orphaned logIds pruned — paste back into Doppler. */
	emitUpdatedOperatorRootKeys?: OperatorRootKeysMap;
	wranglerHints: string[];
	expectedAgentBehavior: string;
}

export class PostRevokeActionsError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'PostRevokeActionsError';
	}
}

function logIdsStillServed(keyDirectory: KeyDirectoryMap, excludeKeyRef: string): Set<string> {
	const served = new Set<string>();
	for (const [ref, entry] of Object.entries(keyDirectory)) {
		if (ref === excludeKeyRef) continue;
		for (const logId of entry.logIds) {
			served.add(logId.toLowerCase());
		}
	}
	return served;
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

	const stillServed = logIdsStillServed(input.keyDirectory, input.keyRef);
	const logIdsOrphaned = entry.logIds.filter((id) => !stillServed.has(id.toLowerCase()));

	const operatorRootKeysEntriesToRemove: Record<string, OperatorRootKeyEntry> = {};
	let emitUpdatedOperatorRootKeys: OperatorRootKeysMap | undefined;

	if (input.operatorRootKeys && logIdsOrphaned.length > 0) {
		emitUpdatedOperatorRootKeys = { ...input.operatorRootKeys };
		for (const logId of logIdsOrphaned) {
			const descriptor = input.operatorRootKeys[logId];
			if (descriptor && descriptor.keyRef === input.keyRef) {
				operatorRootKeysEntriesToRemove[logId] = descriptor;
				delete emitUpdatedOperatorRootKeys[logId];
			}
		}
		if (Object.keys(emitUpdatedOperatorRootKeys).length === 0) {
			emitUpdatedOperatorRootKeys = {};
		}
	}

	const wranglerHints = [
		`Remove "${input.keyRef}" from KEY_DIRECTORY in Doppler (mandate config).`,
		'Update the signer Worker secret with the pruned directory, e.g.:',
		"  printf '%s' '<updated KEY_DIRECTORY json>' | " +
			'wrangler secret put KEY_DIRECTORY --name mandate-signer'
	];

	if (Object.keys(operatorRootKeysEntriesToRemove).length > 0) {
		wranglerHints.push(
			'Prune orphaned logIds from OPERATOR_ROOT_KEYS in Doppler (agent config):',
			`  logIds: ${Object.keys(operatorRootKeysEntriesToRemove).join(', ')}`,
			"  printf '%s' '<updated OPERATOR_ROOT_KEYS json>' | " +
				'wrangler secret put OPERATOR_ROOT_KEYS --name mandate-agent'
		);
	}

	return {
		walletId: input.walletId,
		keyRef: input.keyRef,
		keyDirectoryEntryToRemove: entry,
		operatorRootKeysAffected: [entry.rootSignerAddress],
		logIdsOrphaned,
		operatorRootKeysEntriesToRemove,
		emitUpdatedKeyDirectory,
		emitUpdatedOperatorRootKeys,
		wranglerHints,
		expectedAgentBehavior:
			'Until the signer KEY_DIRECTORY secret is updated the signer rejects RPC ' +
			'(Privy 401/403) and the agent fails closed with 502 on sign for this logId; ' +
			'the coordinator may retry. This is the expected state after a custody revoke.'
	};
}
