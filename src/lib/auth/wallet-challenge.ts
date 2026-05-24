import {
	AuthStrategyNotImplementedError,
	type AuthContext,
	type CoordinatorAuthStrategy
} from './coordinator-auth.js';

/**
 * v3 stub: wallet proves authLogId ownership via signed challenge.
 * Full implementation gated on curator / Univocity trust-root verification.
 */
export class WalletChallengeStrategy implements CoordinatorAuthStrategy {
	readonly mode = 'wallet_challenge' as const;

	async authHeaders(_request: Request, context: AuthContext): Promise<HeadersInit> {
		const proof = context.walletChallengeProof?.trim();
		if (proof) {
			return { Authorization: `Wallet-Challenge ${proof}` };
		}
		throw new AuthStrategyNotImplementedError(
			this.mode,
			'Wallet-challenge auth is not implemented; awaiting coordinator and curator endpoints.'
		);
	}
}
