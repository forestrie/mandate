import { buildRemoteBearerEnv, type Env } from './env.js';
import { createJwksResolver } from './webhook/jwks-resolver.js';
import { KeyRegistry } from './signer/key-registry.js';
import { KvSeenStore } from './dedup/seen-store.js';
import { handleDelegationRequired } from './handle-delegation-required.js';

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);
		if (url.pathname === '/health' && request.method === 'GET') {
			return Response.json({ status: 'ok' });
		}
		if (url.pathname === '/webhooks/delegation-required' && request.method === 'POST') {
			return handleDelegationRequired(request, {
				jwksResolver: createJwksResolver(env.COORDINATOR_UPSTREAM_URL),
				keyRegistry: new KeyRegistry(env.OPERATOR_ROOT_KEYS),
				seenStore: new KvSeenStore(env.REQUEST_KEYS),
				coordinatorUpstreamUrl: env.COORDINATOR_UPSTREAM_URL,
				coordinatorAppToken: env.COORDINATOR_APP_TOKEN,
				mandateSignerToken: env.MANDATE_SIGNER_TOKEN,
				remoteBearerEnv: buildRemoteBearerEnv(env)
			});
		}
		return new Response('Not Found', { status: 404 });
	}
};
