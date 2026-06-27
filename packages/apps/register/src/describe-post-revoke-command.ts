import {
	describePostRevokeActions,
	PostRevokeActionsError,
	type KeyDirectoryMap
} from './describe-post-revoke-actions.js';

export interface DescribePostRevokeOptions {
	walletId: string;
	keyRef: string;
	/** Raw KEY_DIRECTORY JSON (from --key-directory-json or the KEY_DIRECTORY env). */
	keyDirectoryJson?: string;
	/** Print only the pruned KEY_DIRECTORY (for piping into a secret update). */
	emitUpdatedKeyDirectory?: boolean;
}

export interface DescribePostRevokeIo {
	stdout(line: string): void;
	stderr(line: string): void;
}

function parseKeyDirectory(raw: string): KeyDirectoryMap {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		throw new PostRevokeActionsError('KEY_DIRECTORY must be valid JSON');
	}
	if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
		throw new PostRevokeActionsError('KEY_DIRECTORY must be a JSON object');
	}
	return parsed as KeyDirectoryMap;
}

/**
 * Run `privy describe-post-revoke-actions` (FOR-131). Returns an exit code and
 * never mutates Cloudflare/Doppler secrets — it only emits the recommended
 * actions and a pruned KEY_DIRECTORY for the operator to apply.
 */
export function runDescribePostRevokeActionsCommand(
	options: DescribePostRevokeOptions,
	io: DescribePostRevokeIo
): number {
	if (!options.keyDirectoryJson) {
		io.stderr(
			'KEY_DIRECTORY not provided — pass --key-directory-json <json> or set the ' +
				'KEY_DIRECTORY environment variable'
		);
		return 1;
	}

	try {
		const keyDirectory = parseKeyDirectory(options.keyDirectoryJson);
		const actions = describePostRevokeActions({
			walletId: options.walletId,
			keyRef: options.keyRef,
			keyDirectory
		});
		if (options.emitUpdatedKeyDirectory) {
			io.stdout(JSON.stringify(actions.emitUpdatedKeyDirectory, null, 2));
		} else {
			io.stdout(JSON.stringify(actions, null, 2));
		}
		return 0;
	} catch (error) {
		if (error instanceof PostRevokeActionsError) {
			io.stderr(error.message);
			return 1;
		}
		throw error;
	}
}
