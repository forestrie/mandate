import type { ControlPlaneScope } from './control-plane-scope.js';

/** Decoded control-plane session claims. */
export interface SessionTokenClaims {
	v: 1;
	authLogId: string;
	scopes: ControlPlaneScope[];
	exp: number;
	aud: string;
}
