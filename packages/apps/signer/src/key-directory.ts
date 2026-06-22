import { parseEthAddress } from './privy/sig-utils.js';

export interface KeyDirectoryEntry {
	walletId: string;
	rootSignerAddress: string;
	logIds: string[];
	/** Mode C owned-wallet: require `privy-authorization-signature` on Privy RPC. */
	requiresAuthorizationSignature?: boolean;
}

export type KeyDirectoryMap = Record<string, KeyDirectoryEntry>;

export class KeyDirectoryError extends Error {
	constructor(
		message: string,
		readonly status: number
	) {
		super(message);
		this.name = 'KeyDirectoryError';
	}
}

export class KeyDirectory {
	private cache: KeyDirectoryMap | null = null;

	constructor(private readonly rawJson: string) {}

	resolve(keyRef: string, logId: string, rootSignerAddress: string): KeyDirectoryEntry {
		const map = this.load();
		const entry = map[keyRef];
		if (!entry) {
			throw new KeyDirectoryError(`unknown keyRef: ${keyRef}`, 404);
		}
		const normalizedLogId = logId.toLowerCase();
		if (!entry.logIds.some((id) => id.toLowerCase() === normalizedLogId)) {
			throw new KeyDirectoryError(`logId not authorized for keyRef ${keyRef}`, 404);
		}
		const expected = parseEthAddress(entry.rootSignerAddress);
		const requested = parseEthAddress(rootSignerAddress);
		for (let i = 0; i < expected.length; i++) {
			if (expected[i] !== requested[i]) {
				throw new KeyDirectoryError('rootSignerAddress does not match key directory', 400);
			}
		}
		return entry;
	}

	private load(): KeyDirectoryMap {
		if (this.cache) return this.cache;
		let parsed: unknown;
		try {
			parsed = JSON.parse(this.rawJson);
		} catch {
			throw new Error('KEY_DIRECTORY must be valid JSON');
		}
		if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
			throw new Error('KEY_DIRECTORY must be a JSON object');
		}
		const map: KeyDirectoryMap = {};
		for (const [keyRef, value] of Object.entries(parsed)) {
			const entry = value as KeyDirectoryEntry;
			if (!entry.walletId || !entry.rootSignerAddress || !Array.isArray(entry.logIds)) {
				throw new Error(`invalid KEY_DIRECTORY entry for ${keyRef}`);
			}
			if (
				entry.requiresAuthorizationSignature !== undefined &&
				typeof entry.requiresAuthorizationSignature !== 'boolean'
			) {
				throw new Error(`invalid requiresAuthorizationSignature for ${keyRef}: must be boolean`);
			}
			map[keyRef] = entry;
		}
		this.cache = map;
		return map;
	}
}
