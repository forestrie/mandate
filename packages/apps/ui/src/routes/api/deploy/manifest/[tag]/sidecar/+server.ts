import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { fetchManifestAsset, manifestProxyConfig } from '$lib/deploy/manifest-proxy.js';
import { operatorProblem } from '$lib/operator/ops-ui-gate.js';

/** Byte proxy for the `deploy-manifest-<tag>.json.sha256` sidecar (Q7a). */
export const GET: RequestHandler = async ({ params }) => {
	const result = await fetchManifestAsset(manifestProxyConfig(env), params.tag, true);
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
			'Cache-Control': 'public, max-age=300'
		}
	});
};
