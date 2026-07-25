/** x402 protocol shapes used by mandate's operator-owned collection path. */

/** Standard x402 header names. */
export const X402_HEADERS = {
	/** Base64-encoded JSON payment requirements (server → client, with 402). */
	paymentRequired: 'X-PAYMENT-REQUIRED',
	/** Base64-encoded JSON payment payload (client → server). */
	paymentSignature: 'X-PAYMENT',
	/** Base64-encoded JSON settlement response (server → client, with 200). */
	paymentResponse: 'X-PAYMENT-RESPONSE'
} as const;

/** One acceptable way to pay, as advertised in a 402 challenge. */
export interface PaymentRequirementsOption {
	scheme: 'exact';
	/** CAIP-2 chain id, e.g. `eip155:84532`. */
	network: string;
	/** Price in the asset's atomic units. */
	amount: string;
	/** ERC-20 contract address of the settlement asset. */
	asset: string;
	/** The operator's own settlement address. */
	payTo: string;
	maxTimeoutSeconds: number;
	/** EIP-712 domain metadata for the asset's `transferWithAuthorization`. */
	extra: { name: string; version: string };
}

/** What the resource being paid for is. */
export interface ResourceInfo {
	url: string;
	description: string;
	mimeType: string;
}

/** The full 402 challenge body. */
export interface PaymentRequirements {
	x402Version: 2;
	accepts: PaymentRequirementsOption[];
	resource: ResourceInfo;
}

/** EIP-3009 `transferWithAuthorization` authorization tuple. */
export interface ExactEvmAuthorization {
	from: string;
	to: string;
	value: string;
	validAfter: string;
	validBefore: string;
	nonce: string;
}

/** The `X-PAYMENT` payload for the `exact` EVM scheme. */
export interface ExactEvmPayload {
	signature: string;
	authorization: ExactEvmAuthorization;
}

/** The decoded `X-PAYMENT` header, either v1 (flat) or v2 (`accepted`). */
export interface PaymentPayload {
	x402Version: 1 | 2;
	scheme?: string;
	network?: string;
	accepted?: { scheme: string; network: string };
	payload: ExactEvmPayload;
}

/**
 * A payment payload that has been structurally validated against **this
 * operator's** configured payee, network and asset. Structural validity only —
 * it is not yet a settlement.
 */
export interface VerifiedPayment {
	scheme: 'exact';
	network: string;
	payTo: string;
	payerAddress: string;
	amount: string;
	payload: PaymentPayload;
}

export type ParsePaymentResult =
	| { ok: true; value: VerifiedPayment }
	| { ok: false; error: string };
