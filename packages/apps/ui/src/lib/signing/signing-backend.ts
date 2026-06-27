import type { Hex } from 'viem';

/** Pluggable signing backend for delegation material (EOA vs Safe). */
export interface SigningBackend {
	readonly kind: 'eoa' | 'safe';
	isAvailable(): boolean;
	/** Sign keccak256(Sig_structure) and return 0x-prefixed 65-byte recoverable hex. */
	signKs256SigStructure(sigStructureBytes: Uint8Array): Promise<Hex>;
}

export class SigningBackendUnavailableError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'SigningBackendUnavailableError';
	}
}

export class SigningNotImplementedError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'SigningNotImplementedError';
	}
}
