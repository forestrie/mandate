import { env } from '$env/dynamic/private';
import { AppTokenBffStrategy } from './app-token-bff.js';
import type { AuthContext, CoordinatorAuthStrategy } from './coordinator-auth.js';

const SESSION_PREFIX = 'v1.';

function sessionFromRequest(request: Request): string | null {
	const auth = request.headers.get('Authorization')?.trim() ?? '';
	const match = /^Bearer\s+(.+)$/i.exec(auth);
	if (!match) return null;
	const token = match[1]!.trim();
	return token.startsWith(SESSION_PREFIX) ? token : null;
}

/**
 * v1: forward control-plane session from browser to coordinator.
 * Transitional: broker with app token when COORDINATOR_WALLET_CHALLENGE_BROKER=true.
 */
export class WalletChallengeStrategy implements CoordinatorAuthStrategy {
	readonly mode = 'wallet_challenge' as const;
	private readonly broker = new AppTokenBffStrategy();

	async authHeaders(request: Request, context: AuthContext): Promise<HeadersInit> {
		const session =
			context.controlPlaneSession?.trim() || sessionFromRequest(request) || undefined;
		if (session) {
			return { Authorization: `Bearer ${session}` };
		}

		if (env.COORDINATOR_WALLET_CHALLENGE_BROKER?.trim().toLowerCase() === 'true') {
			return this.broker.authHeaders(request, context);
		}

		throw new Error(
			'Control-plane session required. Complete wallet challenge before calling coordinator APIs.'
		);
	}
}
