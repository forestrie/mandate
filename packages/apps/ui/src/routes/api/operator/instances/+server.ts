import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';
import {
	checkOperatorBearer,
	operatorBffConfig,
	operatorProblem
} from '$lib/operator/ops-ui-gate.js';
import { fetchInstancePage } from '$lib/operator/instances-client.js';

export const GET: RequestHandler = async ({ request, url }) => {
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

	const result = await fetchInstancePage(cfg, {
		cursor: url.searchParams.get('cursor') ?? undefined,
		limit: url.searchParams.get('limit') ?? undefined
	});
	if (!result.ok) {
		return operatorProblem(
			result.status,
			result.status === 400 ? 'Bad Request' : 'Bad Gateway',
			result.detail
		);
	}
	return json(result.value);
};
