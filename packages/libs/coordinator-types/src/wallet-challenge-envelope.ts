import type { ControlPlaneScope } from './control-plane-scope.js';
import { WALLET_CHALLENGE_VERSION } from './control-plane-scope.js';

/** Signed challenge envelope (wcc-1). */
export interface WalletChallengeEnvelope {
	version: typeof WALLET_CHALLENGE_VERSION;
	domain: string;
	coordinatorOrigin: string;
	authLogId: string;
	scopes: ControlPlaneScope[];
	nonce: string;
	issuedAt: number;
	expiresAt: number;
	chainId?: string;
}
