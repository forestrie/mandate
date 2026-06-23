import type { ControlPlaneScope } from './control-plane-scope.js';

/** POST /api/auth/challenge response. */
export interface ChallengeResponse {
	version: 'wcc-1';
	nonce: string;
	authLogId: string;
	scopes: ControlPlaneScope[];
	issuedAt: number;
	expiresAt: number;
	domain: string;
	coordinatorOrigin: string;
}
