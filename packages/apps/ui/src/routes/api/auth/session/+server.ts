import { json, type RequestHandler } from '@sveltejs/kit';
import {
	proxyCoordinatorAuth,
	walletChallengeAuthEnabled
} from '$lib/coordinator/auth-proxy.js';

export const POST: RequestHandler = async ({ request }) => {
	if (!walletChallengeAuthEnabled()) {
		return json(
			{
				type: 'about:blank',
				title: 'Not Implemented',
				status: 501,
				detail: 'Wallet-challenge auth is disabled on this mandate instance.'
			},
			{ status: 501 }
		);
	}
	return proxyCoordinatorAuth('session', request);
};
