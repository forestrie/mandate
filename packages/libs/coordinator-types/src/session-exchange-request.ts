import type { WalletChallengeEnvelope } from './wallet-challenge-envelope.js';

/** POST /api/auth/session body. */
export interface SessionExchangeRequest {
	envelope: WalletChallengeEnvelope;
	signature: string;
	alg: 'KS256' | 'ES256';
	/** ES256 only: base64-encoded 32-byte P-256 public key x coordinate */
	publicKeyX?: string;
	/** ES256 only: base64-encoded 32-byte P-256 public key y coordinate */
	publicKeyY?: string;
}
