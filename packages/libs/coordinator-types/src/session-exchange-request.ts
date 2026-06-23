import type { WalletChallengeEnvelope } from './wallet-challenge-envelope.js';

/** POST /api/auth/session body. */
export interface SessionExchangeRequest {
	envelope: WalletChallengeEnvelope;
	signature: string;
	alg: 'KS256' | 'ES256';
}
