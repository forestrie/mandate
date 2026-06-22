import type { Env } from './env.js';
import { handleSign } from './handle-sign.js';

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);
		if (url.pathname === '/health' && request.method === 'GET') {
			return Response.json({ status: 'ok' });
		}
		if (url.pathname === '/v1/sign' && request.method === 'POST') {
			return handleSign(request, { env });
		}
		return new Response('Not Found', { status: 404 });
	}
};
