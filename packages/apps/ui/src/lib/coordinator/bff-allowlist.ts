const LOG_ID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$|^[0-9a-f]{32}$/i;

const ALLOWED_ROUTES: Array<{ method: string; pattern: RegExp }> = [
	{ method: 'GET', pattern: /^delegations\/pending$/ },
	{ method: 'POST', pattern: /^delegations\/certificate$/ },
	{ method: 'GET', pattern: /^logs\/[^/]+\/enabled$/ },
	{ method: 'PUT', pattern: /^logs\/[^/]+\/enabled$/ },
	{ method: 'GET', pattern: /^logs\/[^/]+\/signing-route$/ },
	{ method: 'POST', pattern: /^logs\/[^/]+\/signing-route$/ }
];

export function isPublicCoordinatorPath(method: string, pathSegments: string[]): boolean {
	return (
		method.toUpperCase() === 'POST' && pathSegments.join('/') === 'delegations/certificate'
	);
}

export function isAllowedCoordinatorPath(method: string, pathSegments: string[]): boolean {
	const path = pathSegments.join('/');
	if (!path) return false;

	for (const route of ALLOWED_ROUTES) {
		if (route.method !== method.toUpperCase()) continue;
		if (!route.pattern.test(path)) continue;
		const logMatch = path.match(/^logs\/([^/]+)\//);
		if (logMatch && !LOG_ID_PATTERN.test(logMatch[1]!)) {
			return false;
		}
		return true;
	}
	return false;
}
