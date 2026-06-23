import type { ControlPlaneScope } from './control-plane-scope.js';

/** POST /api/auth/session response. */
export interface SessionExchangeResponse {
	token: string;
	expiresAt: number;
	authLogId: string;
	scopes: ControlPlaneScope[];
}
