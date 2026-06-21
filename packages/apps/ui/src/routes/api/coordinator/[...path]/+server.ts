import type { RequestHandler } from './$types';
import { getCoordinatorAuthStrategy } from '$lib/auth/index.js';
import { proxyToCoordinator, toResponse } from '$lib/coordinator/bff-proxy.js';

export const GET: RequestHandler = async (event) => {
	return handleProxy(event.request, event.params.path ?? '');
};

export const POST: RequestHandler = async (event) => {
	return handleProxy(event.request, event.params.path ?? '');
};

export const PUT: RequestHandler = async (event) => {
	return handleProxy(event.request, event.params.path ?? '');
};

async function handleProxy(request: Request, pathParam: string): Promise<Response> {
	const segments = pathParam.split('/').filter(Boolean);
	const auth = getCoordinatorAuthStrategy();
	const result = await proxyToCoordinator(request, segments, auth);
	return toResponse(result);
}
