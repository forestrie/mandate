import type { ControlPlaneScope } from './control-plane-scope.js';

/** POST /api/auth/challenge body. */
export interface ChallengeRequest {
	authLogId: string;
	scopes: ControlPlaneScope[];
}
