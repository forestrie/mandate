import { parseEthAddress } from './sig-utils.js';

export interface KeyStoreEntry {
	privateKeyHex: string;
	rootSignerAddress: string;
	keyRef: string;
}

export class KeyStoreError extends Error {
	constructor(
		message: string,
		readonly status: number
	) {
		super(message);
		this.name = 'KeyStoreError';
	}
}

export class KeyStore {
	private cache: Map<string, KeyStoreEntry> | null = null;

	constructor(private readonly rawJson: string) {}

	resolve(logId: string, keyRef: string, rootSignerAddress: string): KeyStoreEntry {
		const map = this.load();
		const entry = map.get(logId.toLowerCase());
		if (!entry) {
			throw new KeyStoreError(`unknown logId: ${logId}`, 404);
		}
		if (entry.keyRef !== keyRef) {
			throw new KeyStoreError(`unknown keyRef: ${keyRef}`, 404);
		}
		const expected = parseEthAddress(entry.rootSignerAddress);
		const requested = parseEthAddress(rootSignerAddress);
		for (let i = 0; i < expected.length; i++) {
			if (expected[i] !== requested[i]) {
				throw new KeyStoreError('rootSignerAddress does not match key store', 400);
			}
		}
		return entry;
	}

	private load(): Map<string, KeyStoreEntry> {
		if (this.cache) return this.cache;
		let parsed: unknown;
		try {
			parsed = JSON.parse(this.rawJson);
		} catch {
			throw new Error('USER_SIGNER_KEYS_JSON must be valid JSON');
		}
		if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
			throw new Error('USER_SIGNER_KEYS_JSON must be a JSON object');
		}
		const map = new Map<string, KeyStoreEntry>();
		for (const [logId, value] of Object.entries(parsed)) {
			const entry = value as KeyStoreEntry;
			if (!entry.privateKeyHex || !entry.rootSignerAddress || !entry.keyRef) {
				throw new Error(`invalid USER_SIGNER_KEYS_JSON entry for log ${logId}`);
			}
			map.set(logId.toLowerCase(), entry);
		}
		this.cache = map;
		return map;
	}
}
