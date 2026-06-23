import type {
	ChallengeRequest,
	ChallengeResponse,
	ControlPlaneScope,
	SessionExchangeRequest,
	SessionExchangeResponse,
	WalletChallengeEnvelope
} from '@mandate/coordinator-types';

export interface CachedControlPlaneSession {
	token: string;
	expiresAt: number;
	authLogId: string;
	scopes: ControlPlaneScope[];
}

export interface ControlPlaneSessionDeps {
	fetch: typeof fetch;
	signMessage: (message: string) => Promise<string>;
	challengePath?: string;
	sessionPath?: string;
	nowMs?: () => number;
}

const defaultDeps: Pick<ControlPlaneSessionDeps, 'fetch' | 'challengePath' | 'sessionPath' | 'nowMs'> =
	{
		fetch,
		challengePath: '/api/auth/challenge',
		sessionPath: '/api/auth/session',
		nowMs: () => Date.now()
	};

export function controlPlaneCacheKey(
	authLogId: string,
	scopes: ControlPlaneScope[]
): string {
	return `${authLogId}:${[...scopes].sort().join(',')}`;
}

export function isSessionFresh(
	session: CachedControlPlaneSession,
	nowMs: number,
	skewMs = 30_000
): boolean {
	return session.expiresAt * 1000 > nowMs + skewMs;
}

export async function exchangeControlPlaneSession(
	authLogId: string,
	scopes: ControlPlaneScope[],
	deps: ControlPlaneSessionDeps
): Promise<CachedControlPlaneSession> {
	const fetchImpl = deps.fetch;
	const challengeRes = await fetchImpl(deps.challengePath ?? defaultDeps.challengePath!, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ authLogId, scopes } satisfies ChallengeRequest)
	});
	if (!challengeRes.ok) {
		const detail = await challengeRes.text();
		throw new Error(detail || 'Failed to request wallet challenge');
	}
	const challenge = (await challengeRes.json()) as ChallengeResponse;

	const envelope: WalletChallengeEnvelope = {
		version: challenge.version,
		domain: challenge.domain,
		coordinatorOrigin: challenge.coordinatorOrigin,
		authLogId: challenge.authLogId,
		scopes: challenge.scopes,
		nonce: challenge.nonce,
		issuedAt: challenge.issuedAt,
		expiresAt: challenge.expiresAt
	};
	const signature = await deps.signMessage(
		(await import('@mandate/coordinator-types')).buildKs256ControlPlaneMessage(envelope)
	);

	const sessionBody: SessionExchangeRequest = {
		envelope,
		signature,
		alg: 'KS256'
	};
	const sessionRes = await fetchImpl(deps.sessionPath ?? defaultDeps.sessionPath!, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(sessionBody)
	});
	if (!sessionRes.ok) {
		const detail = await sessionRes.text();
		throw new Error(detail || 'Failed to exchange control-plane session');
	}
	const session = (await sessionRes.json()) as SessionExchangeResponse;
	return {
		token: session.token,
		expiresAt: session.expiresAt,
		authLogId: session.authLogId,
		scopes: session.scopes
	};
}

export async function ensureCachedControlPlaneSession(
	authLogId: string,
	scopes: ControlPlaneScope[],
	cache: Map<string, CachedControlPlaneSession>,
	deps: ControlPlaneSessionDeps
): Promise<CachedControlPlaneSession> {
	const key = controlPlaneCacheKey(authLogId, scopes);
	const nowMs = (deps.nowMs ?? defaultDeps.nowMs!)();
	const existing = cache.get(key);
	if (existing && isSessionFresh(existing, nowMs)) {
		return existing;
	}
	const session = await exchangeControlPlaneSession(authLogId, scopes, deps);
	cache.set(key, session);
	return session;
}
