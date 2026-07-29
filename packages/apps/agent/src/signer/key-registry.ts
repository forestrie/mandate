import type { LogSignerDescriptor } from './log-signer-descriptor.js';

export class UnknownLogSignerError extends Error {
	constructor(logIdHex32: string) {
		super(`no operator root configured for log ${logIdHex32}`);
		this.name = 'UnknownLogSignerError';
	}
}

/**
 * Signing was requested for a Safe 1x1 (Mode D) interactive root. The agent
 * holds no signing route for these logs by design — the root signs in the
 * console, and the coordinator's pending queue carries the demand until the
 * owner does.
 */
export class InteractiveRootSignerError extends Error {
	constructor(logIdHex32: string) {
		super(
			`operator root for log ${logIdHex32} is interactive (Safe 1x1): ` +
				'the root signs in the console — no agent-side signer exists'
		);
		this.name = 'InteractiveRootSignerError';
	}
}

export class KeyRegistry {
	private cache: Map<string, LogSignerDescriptor> | null = null;

	constructor(private readonly rawJson: string) {}

	/**
	 * Signing-path lookup: refuses interactive (Safe 1x1) roots so no signing
	 * code path can ever reach one. Metadata-only readers use `describe`.
	 */
	get(logIdHex32: string): LogSignerDescriptor {
		const descriptor = this.describe(logIdHex32);
		if (descriptor.kind === 'interactive') {
			throw new InteractiveRootSignerError(logIdHex32);
		}
		return descriptor;
	}

	/** Descriptor lookup without the interactive rejection (ops introspection). */
	describe(logIdHex32: string): LogSignerDescriptor {
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
			if (descriptor.kind === 'remote' && !descriptor.keyRef) {
				throw new Error(`keyRef required for remote signer on log ${logId}`);
			}
			// Safe 1x1 (Mode D): an interactive root has NO signing route. A
			// signerUrl here means a misassembled descriptor — fail fast rather
			// than let a signing path form for a console-only root.
			if (descriptor.kind === 'interactive' && descriptor.signerUrl) {
				throw new Error(
					`signerUrl must not be set for interactive root on log ${logId} — ` +
						'the root signs in the console'
				);
			}
			map.set(logId.toLowerCase(), descriptor);
		}
		this.cache = map;
		return map;
	}
}
