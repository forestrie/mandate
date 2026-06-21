import { env } from '$env/dynamic/private';
import { AuthStrategyNotImplementedError } from '$lib/auth/coordinator-auth.js';
import type { CoordinatorAuthStrategy } from '$lib/auth/coordinator-auth.js';
import type { AuthContext } from '$lib/auth/coordinator-auth.js';

const LOG_ID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$|^[0-9a-f]{32}$/i;

const ALLOWED_ROUTES: Array<{ method: string; pattern: RegExp }> = [
	{ method: 'GET', pattern: /^delegations\/pending$/ },
	{ method: 'POST', pattern: /^delegations\/material$/ },
	{ method: 'GET', pattern: /^logs\/[^/]+\/signing-route$/ },
	{ method: 'POST', pattern: /^logs\/[^/]+\/signing-route$/ },
	{ method: 'POST', pattern: /^logs\/[^/]+\/custody-keys$/ }
];

export interface ProxyResult {
	status: number;
	headers: Headers;
	body: ArrayBuffer | null;
}

export function isAllowedCoordinatorPath(method: string, pathSegments: string[]): boolean {
	const path = pathSegments.join('/');
	if (!path) return false;

	for (const route of ALLOWED_ROUTES) {
		if (route.method !== method.toUpperCase()) continue;
		if (!route.pattern.test(path)) continue;
		if (path.includes('custody-keys') && !custodyKeysEnabled()) {
			return false;
		}
		const logMatch = path.match(/^logs\/([^/]+)\//);
		if (logMatch && !LOG_ID_PATTERN.test(logMatch[1]!)) {
			return false;
		}
		return true;
	}
	return false;
}

function custodyKeysEnabled(): boolean {
	return env.ENABLE_CUSTODY_KEYS_BFF?.trim().toLowerCase() === 'true';
}

export function coordinatorUpstreamBase(): string {
	const base = env.COORDINATOR_UPSTREAM_URL?.trim();
	if (!base) {
		throw new Error('COORDINATOR_UPSTREAM_URL is not configured');
	}
	return base.replace(/\/$/, '');
}

export async function proxyToCoordinator(
	request: Request,
	pathSegments: string[],
	auth: CoordinatorAuthStrategy,
	context: AuthContext = {}
): Promise<ProxyResult> {
	const method = request.method.toUpperCase();
	if (!isAllowedCoordinatorPath(method, pathSegments)) {
		return problem(404, 'Not Found', 'Coordinator path is not allowlisted');
	}

	let authHeaders: HeadersInit;
	try {
		authHeaders = await auth.authHeaders(request, context);
	} catch (error) {
		if (error instanceof AuthStrategyNotImplementedError) {
			return problem(501, 'Not Implemented', error.message);
		}
		throw error;
	}

	const upstreamUrl = new URL(`/api/${pathSegments.join('/')}`, coordinatorUpstreamBase());
	upstreamUrl.search = new URL(request.url).search;

	const headers = new Headers();
	const contentType = request.headers.get('Content-Type');
	if (contentType) headers.set('Content-Type', contentType);
	for (const [key, value] of Object.entries(authHeaders)) {
		headers.set(key, value);
	}

	const init: RequestInit = { method, headers };
	if (method !== 'GET' && method !== 'HEAD') {
		init.body = await request.arrayBuffer();
	}

	const response = await fetch(upstreamUrl, init);
	const body = response.status === 204 ? null : await response.arrayBuffer();
	return {
		status: response.status,
		headers: response.headers,
		body
	};
}

function problem(status: number, title: string, detail: string): ProxyResult {
	const payload = JSON.stringify({
		type: 'about:blank',
		title,
		status,
		detail
	});
	return {
		status,
		headers: new Headers({ 'Content-Type': 'application/problem+json' }),
		body: new TextEncoder().encode(payload).buffer
	};
}

export function toResponse(result: ProxyResult): Response {
	const headers = new Headers(result.headers);
	if (result.body && !headers.has('Content-Type')) {
		headers.set('Content-Type', 'application/json');
	}
	return new Response(result.body, { status: result.status, headers });
}
