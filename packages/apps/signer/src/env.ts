/** Cloudflare Worker bindings for @mandate/signer. */
export interface Env {
	MANDATE_SIGNER_TOKEN: string;
	PRIVY_APP_ID: string;
	PRIVY_APP_SECRET: string;
	KEY_DIRECTORY: string;
	PRIVY_API_BASE?: string;
	/** Optional `wallet-auth:`-prefixed base64 PKCS#8 DER P-256 key for owned-wallet RPC. */
	PRIVY_AUTHORIZATION_KEY?: string;
}
