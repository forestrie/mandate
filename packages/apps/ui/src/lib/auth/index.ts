import { env } from '$env/dynamic/private';
import { AppTokenBffStrategy } from './app-token-bff.js';
import type { CoordinatorAuthStrategy } from './coordinator-auth.js';
import { parseCoordinatorAuthMode } from './coordinator-auth.js';
import { IssuerTokenStrategy } from './issuer-token.js';
import { WalletChallengeStrategy } from './wallet-challenge.js';

let cached: CoordinatorAuthStrategy | undefined;

export function getCoordinatorAuthStrategy(): CoordinatorAuthStrategy {
	if (cached) return cached;
	const mode = parseCoordinatorAuthMode(env.COORDINATOR_AUTH_MODE);
	switch (mode) {
		case 'issuer_token':
			cached = new IssuerTokenStrategy();
			break;
		case 'wallet_challenge':
			cached = new WalletChallengeStrategy();
			break;
		case 'app_token_bff':
		default:
			cached = new AppTokenBffStrategy();
	}
	return cached;
}

/** Reset cached strategy (tests). */
export function resetCoordinatorAuthStrategy(): void {
	cached = undefined;
}
