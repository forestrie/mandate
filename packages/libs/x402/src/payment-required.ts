import type { OperatorPaymentConfig } from './operator-payment-config.js';
import type { PaymentRequirements, PaymentRequirementsOption, ResourceInfo } from './types.js';

/** How long a challenge stays payable, seconds. */
const MAX_TIMEOUT_SECONDS = 300;

/**
 * Build the `accepts` entry advertising **this operator's** terms.
 *
 * Every field comes from `config`, which is itself unconstructible without
 * deployment configuration (see `resolveOperatorPaymentConfig`). There is no
 * path by which a fork advertises an address it did not configure.
 */
export function buildPaymentRequirementsOption(
	config: OperatorPaymentConfig
): PaymentRequirementsOption {
	return {
		scheme: 'exact',
		network: config.network,
		amount: config.priceAtomic,
		asset: config.asset,
		payTo: config.payTo,
		maxTimeoutSeconds: MAX_TIMEOUT_SECONDS,
		extra: {
			name: config.assetEip712Name,
			version: config.assetEip712Version
		}
	};
}

/** Build the full x402 v2 challenge body. */
export function buildPaymentRequirements(
	config: OperatorPaymentConfig,
	resource: ResourceInfo
): PaymentRequirements {
	return {
		x402Version: 2,
		accepts: [buildPaymentRequirementsOption(config)],
		resource
	};
}

/** Base64-encode the challenge for the `X-PAYMENT-REQUIRED` header. */
export function encodePaymentRequiredHeader(requirements: PaymentRequirements): string {
	// btoa is available in Workers and in Node >= 16.
	return btoa(JSON.stringify(requirements));
}
