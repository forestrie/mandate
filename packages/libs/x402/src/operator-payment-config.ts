/**
 * The operator's own settlement configuration (FOR-428, plan-2607-36 M5).
 *
 * A forked mandate operator collects **its own** fees, into a contract or token
 * it deploys beside its own univocity instance. Canopy is not in that path and
 * must never learn this operator's prices or payees (ADR-0058 §8).
 *
 * Every economic field is **deployment configuration with no compiled-in
 * default**. Baking an address into source is what made canopy's dev and prod
 * settle to the same treasury, so a dev payment was indistinguishable from a
 * production one (ADR-0058 consequences; canopy FOR-465). Here the failure mode
 * is worse than ambiguity: a fork that shipped with a fallback would silently
 * settle its customers' money to whichever address the fallback names — i.e.
 * upstream's. So this **fails closed**: an operator that has not configured a
 * payee cannot issue a 402 challenge, cannot accept a payment, and therefore
 * cannot issue a paid grant.
 */

/** Raised when required settlement configuration is absent or empty. */
export class PaymentConfigError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'PaymentConfigError';
	}
}

/** Resolved, non-empty settlement configuration for this deployment. */
export interface OperatorPaymentConfig {
	/** The operator's own settlement address. Never defaulted. */
	payTo: string;
	/** Price in the asset's atomic units. Never defaulted. */
	priceAtomic: string;
	/** CAIP-2 chain id, e.g. `eip155:84532`. Never defaulted. */
	network: string;
	/** ERC-20 settlement asset on `network`. Never defaulted — it is chain-specific. */
	asset: string;
	/**
	 * EIP-712 domain metadata for the asset's `transferWithAuthorization`.
	 * Not economic configuration: these are properties of the ERC-20 contract
	 * named by `asset`, so they carry ERC-20-conventional defaults and are
	 * overridable for assets that differ.
	 */
	assetEip712Name: string;
	assetEip712Version: string;
	/** Facilitator base URL used to verify and settle. Never defaulted. */
	facilitatorUrl: string;
}

/** The raw environment slice this module reads. All values are strings. */
export interface OperatorPaymentEnv {
	X402_PAYTO_ADDRESS?: string;
	X402_PRICE_ATOMIC?: string;
	X402_NETWORK?: string;
	X402_ASSET_ADDRESS?: string;
	X402_ASSET_EIP712_NAME?: string;
	X402_ASSET_EIP712_VERSION?: string;
	X402_FACILITATOR_URL?: string;
}

/** ERC-20 EIP-712 domain conventions (not economic config — see the interface). */
const DEFAULT_ASSET_EIP712_NAME = 'USDC';
const DEFAULT_ASSET_EIP712_VERSION = '2';

/**
 * Require a configured value. There is deliberately no fallback: returning a
 * compiled-in address here would settle an operator's revenue to someone else.
 */
function require0(name: string, value: string | undefined, why: string): string {
	const trimmed = value?.trim();
	if (!trimmed) {
		throw new PaymentConfigError(
			`${name} is required and has no default — ${why}. Configure it for this deployment.`
		);
	}
	return trimmed;
}

/**
 * Resolve this operator's settlement configuration, or throw.
 *
 * Throws `PaymentConfigError` naming the first missing variable. Callers must
 * translate that into a refusal (503), never into a default.
 */
export function resolveOperatorPaymentConfig(env: OperatorPaymentEnv): OperatorPaymentConfig {
	return {
		payTo: require0(
			'X402_PAYTO_ADDRESS',
			env.X402_PAYTO_ADDRESS,
			'it is the address this operator collects its own fees at'
		),
		priceAtomic: require0(
			'X402_PRICE_ATOMIC',
			env.X402_PRICE_ATOMIC,
			'this operator sets its own grant price'
		),
		network: require0(
			'X402_NETWORK',
			env.X402_NETWORK,
			'the settlement chain is per deployment (CAIP-2, e.g. eip155:84532)'
		),
		asset: require0(
			'X402_ASSET_ADDRESS',
			env.X402_ASSET_ADDRESS,
			'the settlement asset contract is specific to X402_NETWORK'
		),
		assetEip712Name: env.X402_ASSET_EIP712_NAME?.trim() || DEFAULT_ASSET_EIP712_NAME,
		assetEip712Version: env.X402_ASSET_EIP712_VERSION?.trim() || DEFAULT_ASSET_EIP712_VERSION,
		facilitatorUrl: require0(
			'X402_FACILITATOR_URL',
			env.X402_FACILITATOR_URL,
			'the facilitator that verifies and settles is per deployment'
		)
	};
}

/**
 * Non-throwing probe: is this deployment configured to collect at all?
 *
 * An operator that does not sell grants leaves these unset; the grants route
 * then refuses rather than paywalling to a foreign address.
 */
export function isPaymentConfigured(env: OperatorPaymentEnv): boolean {
	try {
		resolveOperatorPaymentConfig(env);
		return true;
	} catch {
		return false;
	}
}
