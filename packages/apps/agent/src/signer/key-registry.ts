import type { LogSignerDescriptor } from './log-signer-descriptor.js';

export class UnknownLogSignerError extends Error {
	constructor(logIdHex32: string) {
		super(`no operator root configured for log ${logIdHex32}`);
		this.name = 'UnknownLogSignerError';
	}
}

export class KeyRegistry {
	private cache: Map<string, LogSignerDescriptor> | null = null;

	constructor(private readonly rawJson: string) {}

	get(logIdHex32: string): LogSignerDescriptor {
		const map = this.load();
		const descriptor = map.get(logIdHex32.toLowerCase());
		if (!descriptor) {
			throw new UnknownLogSignerError(logIdHex32);
		}
		return descriptor;
	}

	has(logIdHex32: string): boolean {
		return this.load().has(logIdHex32.toLowerCase());
	}

	private load(): Map<string, LogSignerDescriptor> {
		if (this.cache) return this.cache;
		let parsed: unknown;
		try {
			parsed = JSON.parse(this.rawJson);
		} catch {
			throw new Error('OPERATOR_ROOT_KEYS must be valid JSON');
		}
		if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
			throw new Error('OPERATOR_ROOT_KEYS must be a JSON object');
		}
		const map = new Map<string, LogSignerDescriptor>();
		for (const [logId, value] of Object.entries(parsed)) {
			const descriptor = value as LogSignerDescriptor;
			if (descriptor.alg !== 'KS256') {
				throw new Error(`unsupported alg for log ${logId}`);
			}
			if (!descriptor.rootSignerAddress) {
				throw new Error(`rootSignerAddress required for log ${logId}`);
			}
			if (descriptor.kind === 'local' && !descriptor.privateKeyHex) {
				throw new Error(`privateKeyHex required for local signer on log ${logId}`);
			}
			if (descriptor.kind === 'remote' && !descriptor.signerUrl) {
				throw new Error(`signerUrl required for remote signer on log ${logId}`);
			}
			map.set(logId.toLowerCase(), descriptor);
		}
		this.cache = map;
		return map;
	}
}
