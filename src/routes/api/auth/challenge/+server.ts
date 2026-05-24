import { json, type RequestHandler } from '@sveltejs/kit';

/** v3 stub until curator / coordinator wallet-challenge endpoints land. */
export const POST: RequestHandler = async () => {
	return json(
		{
			type: 'about:blank',
			title: 'Not Implemented',
			status: 501,
			detail:
				'Wallet-challenge auth is not implemented yet. See docs/adr-0001-auth-strategy-seams.md.'
		},
		{ status: 501 }
	);
};

export const GET: RequestHandler = async () => {
	return json(
		{
			type: 'about:blank',
			title: 'Not Implemented',
			status: 501,
			detail: 'Wallet challenge issuance is pending curator integration.'
		},
		{ status: 501 }
	);
};
