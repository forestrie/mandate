export const WEBHOOK_JWKS_PATH = '/.well-known/forestrie-webhook-jwks.json';

export interface WebhookJwk {
	kid: string;
	alg: string;
	use?: string;
	kty: string;
	crv?: string;
	x?: string;
	y?: string;
}

export interface JwksDocument {
	keys: WebhookJwk[];
}

export interface JwksResolver {
	resolveVerificationKeys(): Promise<WebhookJwk[]>;
	invalidate(): void;
}

export function createJwksResolver(
	coordinatorUpstreamUrl: string,
	fetchImpl: typeof fetch = fetch
): JwksResolver {
	const origin = new URL(coordinatorUpstreamUrl).origin;
	let cached: WebhookJwk[] | null = null;

	async function fetchJwks(): Promise<WebhookJwk[]> {
		const url = `${origin}${WEBHOOK_JWKS_PATH}`;
		const response = await fetchImpl(url);
		if (!response.ok) {
			throw new Error(`JWKS fetch failed: ${response.status}`);
		}
		const body = (await response.json()) as JwksDocument;
		if (!Array.isArray(body.keys) || body.keys.length === 0) {
			throw new Error('JWKS document has no keys');
		}
		return body.keys;
	}

	return {
		async resolveVerificationKeys() {
			if (cached) return cached;
			cached = await fetchJwks();
			return cached;
		},
		invalidate() {
			cached = null;
		}
	};
}
