export interface SeenStore {
	has(requestKey: string): Promise<boolean>;
	markSeen(requestKey: string, ttlSeconds?: number): Promise<void>;
}

export class MemorySeenStore implements SeenStore {
	private readonly seen = new Set<string>();

	async has(requestKey: string): Promise<boolean> {
		return this.seen.has(requestKey);
	}

	async markSeen(requestKey: string): Promise<void> {
		this.seen.add(requestKey);
	}
}

export class KvSeenStore implements SeenStore {
	constructor(
		private readonly kv: KVNamespace,
		private readonly defaultTtlSeconds = 3600
	) {}

	async has(requestKey: string): Promise<boolean> {
		const value = await this.kv.get(requestKey);
		return value !== null;
	}

	async markSeen(requestKey: string, ttlSeconds = this.defaultTtlSeconds): Promise<void> {
		await this.kv.put(requestKey, '1', { expirationTtl: ttlSeconds });
	}
}
