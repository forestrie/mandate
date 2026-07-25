import { buildOperatorPaymentEnv, buildRemoteBearerEnv, type Env } from './env.js';
import { createJwksResolver } from './webhook/jwks-resolver.js';
import { KeyRegistry } from './signer/key-registry.js';
import { KvSeenStore } from './dedup/seen-store.js';
import { handleDelegationRequired } from './handle-delegation-required.js';
import { handleGrantRequest } from './grants/handle-grant-request.js';
import { handleRootKeyConfig } from './ops/handle-root-key-config.js';

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);
		if (url.pathname === '/health' && request.method === 'GET') {
			return Response.json({ status: 'ok' });
		}
		if (url.pathname === '/ops/root-key-config' && request.method === 'GET') {
			// Same per-request env lookup as the signing path below (FOR-311 S1):
			// what this returns is what the next delegation.required would use.
			return handleRootKeyConfig(request, {
				keyRegistry: new KeyRegistry(env.OPERATOR_ROOT_KEYS),
				opsIntrospectionToken: env.OPS_INTROSPECTION_TOKEN
			});
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
		if (url.pathname === '/grants' && request.method === 'POST') {
			// FOR-428: the operator's OWN paid grant surface. Note what is NOT
			// passed in — no coordinator URL, no coordinator token, no key
			// registry. The payment plane gets settlement config and nothing else,
			// and the delegation/verification path above gets no payment state
			// (ARC-0022 I7).
			return handleGrantRequest(request, {
				paymentEnv: buildOperatorPaymentEnv(env),
				facilitatorAuthorization: env.X402_FACILITATOR_AUTHORIZATION
			});
		}
		return new Response('Not Found', { status: 404 });
	}
};
