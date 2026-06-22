/** Cloudflare Worker bindings and configuration for @mandate/agent. */
export interface Env {
	COORDINATOR_UPSTREAM_URL: string;
	COORDINATOR_APP_TOKEN: string;
	OPERATOR_ROOT_KEYS: string;
	MANDATE_SIGNER_TOKEN: string;
	REQUEST_KEYS: KVNamespace;
}
