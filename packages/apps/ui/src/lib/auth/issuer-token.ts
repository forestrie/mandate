import {
	AuthStrategyNotImplementedError,
	type AuthContext,
	type CoordinatorAuthStrategy
} from './coordinator-auth.js';

/**
 * v2 stub: per-log issuerToken from signing route (coordinator extension pending).
 * See docs/adr-0001-auth-strategy-seams.md
 */
export class IssuerTokenStrategy implements CoordinatorAuthStrategy {
	readonly mode = 'issuer_token' as const;

	async authHeaders(_request: Request, context: AuthContext): Promise<HeadersInit> {
		const token = context.issuerToken?.trim();
		if (token) {
			return { Authorization: `Bearer ${token}` };
		}
		throw new AuthStrategyNotImplementedError(
			this.mode,
			'Issuer-token auth requires per-log token from signing route; coordinator UX APIs do not accept issuerToken yet.'
		);
	}
}
