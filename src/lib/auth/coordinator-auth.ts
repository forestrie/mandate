/** Context passed to coordinator auth strategies. */
export interface AuthContext {
	authLogId?: string;
	logId?: string;
	issuerToken?: string;
	walletChallengeProof?: string;
}

/** Server-side strategy for upstream coordinator Authorization headers. */
export interface CoordinatorAuthStrategy {
	readonly mode: CoordinatorAuthMode;
	authHeaders(request: Request, context: AuthContext): Promise<HeadersInit>;
}

export type CoordinatorAuthMode = 'app_token_bff' | 'issuer_token' | 'wallet_challenge';

export class AuthStrategyNotImplementedError extends Error {
	constructor(
		readonly mode: CoordinatorAuthMode,
		message: string
	) {
		super(message);
		this.name = 'AuthStrategyNotImplementedError';
	}
}

export function parseCoordinatorAuthMode(raw: string | undefined): CoordinatorAuthMode {
	switch (raw?.trim()) {
		case 'issuer_token':
			return 'issuer_token';
		case 'wallet_challenge':
			return 'wallet_challenge';
		case 'app_token_bff':
		default:
			return 'app_token_bff';
	}
}
