/** Per-keyRef rate limiting for POST /v1/sign (Cloudflare Rate Limit API). */
export interface SignerRateLimitEnv {
	SIGNER_RATE_LIMITER?: {
		limit(options: { key: string }): Promise<{ success: boolean }>;
	};
}

export async function checkSignerRateLimit(
	keyRef: string,
	env: SignerRateLimitEnv
): Promise<Response | null> {
	const limiter = env.SIGNER_RATE_LIMITER;
	if (!limiter) {
		return null;
	}
	const { success } = await limiter.limit({ key: keyRef });
	if (success) {
		return null;
	}
	return new Response(JSON.stringify({ ok: false, error: 'rate limit exceeded' }), {
		status: 429,
		headers: { 'Content-Type': 'application/json' }
	});
}
