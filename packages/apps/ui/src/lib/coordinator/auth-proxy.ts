import { env } from '$env/dynamic/private';
import { coordinatorUpstreamBase } from './bff-proxy.js';

/** Proxy unauthenticated coordinator auth endpoints (challenge/session). */
export async function proxyCoordinatorAuth(
	path: 'challenge' | 'session',
	request: Request
): Promise<Response> {
	const upstreamUrl = new URL(`/api/auth/${path}`, coordinatorUpstreamBase());
	const headers = new Headers();
	const contentType = request.headers.get('Content-Type');
	if (contentType) headers.set('Content-Type', contentType);

	const response = await fetch(upstreamUrl, {
		method: 'POST',
		headers,
		body: await request.arrayBuffer()
	});

	const body = response.status === 204 ? null : await response.arrayBuffer();
	return new Response(body, {
		status: response.status,
		headers: response.headers
	});
}

export function walletChallengeAuthEnabled(): boolean {
	return env.ENABLE_WALLET_CHALLENGE_AUTH?.trim().toLowerCase() !== 'false';
}
