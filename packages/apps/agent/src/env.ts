/** Cloudflare Worker bindings and configuration for @mandate/agent. */
export interface Env {
	COORDINATOR_UPSTREAM_URL: string;
	COORDINATOR_APP_TOKEN: string;
	OPERATOR_ROOT_KEYS: string;
	MANDATE_SIGNER_TOKEN: string;
	/** Mode B user remote signer bearer (when descriptor sets bearerEnvKey). */
	USER_SIGNER_BEARER?: string;
	/**
	 * Bearer for GET /ops/root-key-config (FOR-311 S1). The endpoint refuses
	 * (503) when this is unset — introspection fails closed on agents deployed
	 * without it.
	 */
	OPS_INTROSPECTION_TOKEN?: string;
	REQUEST_KEYS: KVNamespace;
}

/** Env vars referenced by OPERATOR_ROOT_KEYS `bearerEnvKey` descriptors. */
export function buildRemoteBearerEnv(env: Env): Record<string, string | undefined> {
	return {
		USER_SIGNER_BEARER: env.USER_SIGNER_BEARER
	};
}
