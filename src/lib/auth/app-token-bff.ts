import { env } from '$env/dynamic/private';
import type { AuthContext, CoordinatorAuthStrategy } from './coordinator-auth.js';

/** v1: inject global coordinator app token from Pages Functions / BFF. */
export class AppTokenBffStrategy implements CoordinatorAuthStrategy {
	readonly mode = 'app_token_bff' as const;

	async authHeaders(_request: Request, _context: AuthContext): Promise<HeadersInit> {
		void _request;
		void _context;
		const token = env.COORDINATOR_APP_TOKEN?.trim();
		if (!token) {
			throw new Error('COORDINATOR_APP_TOKEN is not configured');
		}
		return { Authorization: `Bearer ${token}` };
	}
}

export function isAppTokenBffMode(): boolean {
	return (env.COORDINATOR_AUTH_MODE?.trim() || 'app_token_bff') === 'app_token_bff';
}
