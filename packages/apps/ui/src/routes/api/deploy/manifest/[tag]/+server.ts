import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { fetchManifestAsset, manifestProxyConfig } from '$lib/deploy/manifest-proxy.js';
import { operatorProblem } from '$lib/operator/ops-ui-gate.js';

/**
 * Dumb byte proxy for `deploy-manifest-<tag>.json` (plan-2607-47 Q7a). No
 * auth gate: the asset is public release content; the proxy only spends the
 * optional server-side GitHub token, never exposes it. Verification happens
 * in-page — this route must not touch the bytes.
 */
export const GET: RequestHandler = async ({ params }) => {
	const result = await fetchManifestAsset(manifestProxyConfig(env), params.tag, false);
	if (!result.ok) {
		return operatorProblem(
			result.status,
			result.status === 400 ? 'Bad Request' : result.status === 404 ? 'Not Found' : 'Bad Gateway',
			result.detail
		);
	}
	return new Response(result.bytes, {
		headers: {
			'Content-Type': result.contentType,
			// Release assets are effectively immutable per tag; a short shared
			// max-age still smooths repeated wizard visits.
			'Cache-Control': 'public, max-age=300'
		}
	});
};
