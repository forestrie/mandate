import type { OperatorPaymentEnv } from '@mandate/x402';

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

	/**
	 * This operator's own x402 settlement configuration (FOR-428).
	 *
	 * Optional on `Env` because an operator that does not sell grants need not
	 * set them — but NOT optional to `POST /grants`, which refuses (503) unless
	 * every one is configured. There is no compiled-in fallback anywhere: a fork
	 * must never settle its customers' money to an address it did not choose.
	 * See `resolveOperatorPaymentConfig` in `@mandate/x402`.
	 */
	X402_PAYTO_ADDRESS?: string;
	X402_PRICE_ATOMIC?: string;
	X402_NETWORK?: string;
	X402_ASSET_ADDRESS?: string;
	X402_ASSET_EIP712_NAME?: string;
	X402_ASSET_EIP712_VERSION?: string;
	X402_FACILITATOR_URL?: string;
	/** Bearer for facilitators that require credentials. */
	X402_FACILITATOR_AUTHORIZATION?: string;
}

/**
 * The settlement-config slice of `Env`, copied field by field.
 *
 * Copied rather than passed whole so the payment plane cannot reach coordinator
 * tokens or signing key material.
 */
export function buildOperatorPaymentEnv(env: Env): OperatorPaymentEnv {
	return {
		X402_PAYTO_ADDRESS: env.X402_PAYTO_ADDRESS,
		X402_PRICE_ATOMIC: env.X402_PRICE_ATOMIC,
		X402_NETWORK: env.X402_NETWORK,
		X402_ASSET_ADDRESS: env.X402_ASSET_ADDRESS,
		X402_ASSET_EIP712_NAME: env.X402_ASSET_EIP712_NAME,
		X402_ASSET_EIP712_VERSION: env.X402_ASSET_EIP712_VERSION,
		X402_FACILITATOR_URL: env.X402_FACILITATOR_URL
	};
}

/** Env vars referenced by OPERATOR_ROOT_KEYS `bearerEnvKey` descriptors. */
export function buildRemoteBearerEnv(env: Env): Record<string, string | undefined> {
	return {
		USER_SIGNER_BEARER: env.USER_SIGNER_BEARER
	};
}
