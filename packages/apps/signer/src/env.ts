/** Cloudflare Worker bindings for @mandate/signer. */
export interface Env {
	MANDATE_SIGNER_TOKEN: string;
	PRIVY_APP_ID: string;
	PRIVY_APP_SECRET: string;
	KEY_DIRECTORY: string;
	PRIVY_API_BASE?: string;
	/** Optional P-256 PKCS#8 PEM for owned-wallet authorization signatures. */
	PRIVY_AUTHORIZATION_KEY?: string;
}
