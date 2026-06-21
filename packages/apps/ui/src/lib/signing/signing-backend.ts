import type { Hex } from 'viem';

/** Pluggable signing backend for delegation material (EOA vs Safe). */
export interface SigningBackend {
	readonly kind: 'eoa' | 'safe';
	isAvailable(): boolean;
	signKs256Hash(hash: Hex): Promise<Hex>;
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
