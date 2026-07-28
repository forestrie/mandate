import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';
import {
	checkOperatorBearer,
	operatorBffConfig,
	operatorProblem
} from '$lib/operator/ops-ui-gate.js';
import { fetchKillSwitchEnabled } from '$lib/operator/instances-client.js';

/**
 * Effective enforcement state for one instance's root log — the kill-switch
 * read. This is the discriminator's second half: the enumeration's
 * `enforcementFrozen` is only the indexer-held marker (see
 * instances-client.ts); `enabled` here is what sealing actually honours.
 */
export const GET: RequestHandler = async ({ request, params }) => {
	const cfg = operatorBffConfig(env);
	if (!cfg) {
		return operatorProblem(
			501,
			'Not Implemented',
			'The operator personality is not configured on this mandate deployment.'
		);
	}
	if (!(await checkOperatorBearer(request, cfg.opsUiToken))) {
		return operatorProblem(401, 'Unauthorized', 'Operator token required.');
	}

	const result = await fetchKillSwitchEnabled(cfg, params.r ?? '');
	if (!result.ok) {
		const title =
			result.status === 400 ? 'Bad Request' : result.status === 404 ? 'Not Found' : 'Bad Gateway';
		return operatorProblem(result.status, title, result.detail);
	}
	return json(result.value);
};
