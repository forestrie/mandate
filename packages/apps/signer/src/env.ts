/** Cloudflare Worker bindings for @mandate/signer. */
export interface Env {
	MANDATE_SIGNER_TOKEN: string;
	MANDATE_PRIVY_APP_ID: string;
	MANDATE_PRIVY_APP_SECRET: string;
	MANDATE_PRIVY_API_BASE: string;
	KEY_DIRECTORY: string;
	/** Optional `wallet-auth:`-prefixed base64 PKCS#8 DER P-256 key for owned-wallet RPC. */
	MANDATE_PRIVY_AUTHORIZATION_KEY?: string;
	/** Optional per-keyRef rate limit binding (see wrangler.jsonc). */
	SIGNER_RATE_LIMITER?: {
		limit(options: { key: string }): Promise<{ success: boolean }>;
	};
}
