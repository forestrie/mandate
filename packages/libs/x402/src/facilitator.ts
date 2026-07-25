import type { OperatorPaymentConfig } from './operator-payment-config.js';
import { buildPaymentRequirementsOption } from './payment-required.js';
import type { PaymentPayload } from './types.js';

/**
 * Facilitator client — the operator's own facilitator, named by
 * `X402_FACILITATOR_URL`.
 *
 * Two calls, in this order and never merged:
 *
 * 1. `verify` — is this payload settleable? Cheap, no money moves.
 * 2. `settle` — move the money.
 *
 * The gap between them is where issuance happens. If issuance fails we have
 * not settled, so the customer is not charged for a grant they did not get.
 */

export interface FacilitatorVerifyResult {
	ok: boolean;
	/** Facilitator-supplied reason when `ok` is false. */
	reason?: string;
}

export interface FacilitatorSettleResult {
	ok: boolean;
	/** Settlement identifier / tx hash, when the facilitator supplies one. */
	settlementId?: string;
	transaction?: string;
	network?: string;
	payer?: string;
	reason?: string;
}

export interface FacilitatorDeps {
	config: OperatorPaymentConfig;
	fetchImpl?: typeof fetch;
	/** Optional bearer for facilitators that require credentials. */
	authorization?: string;
}

function endpoint(base: string, path: string): string {
	return `${base.replace(/\/+$/, '')}/${path}`;
}

async function post(
	deps: FacilitatorDeps,
	path: string,
	body: unknown
): Promise<{ status: number; json: Record<string, unknown> | null }> {
	const doFetch = deps.fetchImpl ?? fetch;
	const headers: Record<string, string> = { 'Content-Type': 'application/json' };
	if (deps.authorization) headers.Authorization = deps.authorization;
	const response = await doFetch(endpoint(deps.config.facilitatorUrl, path), {
		method: 'POST',
		headers,
		body: JSON.stringify(body)
	});
	let json: Record<string, unknown> | null;
	try {
		json = (await response.json()) as Record<string, unknown>;
	} catch {
		// A non-JSON facilitator response is a failure, not a success with no body.
		json = null;
	}
	return { status: response.status, json };
}

/** Ask the facilitator whether this payload would settle. No money moves. */
export async function verifyPayment(
	deps: FacilitatorDeps,
	payload: PaymentPayload
): Promise<FacilitatorVerifyResult> {
	const { status, json } = await post(deps, 'verify', {
		x402Version: 2,
		paymentPayload: payload,
		paymentRequirements: buildPaymentRequirementsOption(deps.config)
	});
	if (status < 200 || status >= 300) {
		return { ok: false, reason: `facilitator verify failed: ${status}` };
	}
	const valid = json?.isValid ?? json?.valid ?? json?.ok;
	if (valid !== true) {
		const reason = typeof json?.invalidReason === 'string' ? json.invalidReason : 'payment invalid';
		return { ok: false, reason };
	}
	return { ok: true };
}

/** Settle. Call this only after the thing being paid for has been produced. */
export async function settlePayment(
	deps: FacilitatorDeps,
	payload: PaymentPayload
): Promise<FacilitatorSettleResult> {
	const { status, json } = await post(deps, 'settle', {
		x402Version: 2,
		paymentPayload: payload,
		paymentRequirements: buildPaymentRequirementsOption(deps.config)
	});
	if (status < 200 || status >= 300) {
		return { ok: false, reason: `facilitator settle failed: ${status}` };
	}
	const success = json?.success ?? json?.ok;
	if (success !== true) {
		const reason = typeof json?.errorReason === 'string' ? json.errorReason : 'settlement failed';
		return { ok: false, reason };
	}
	return {
		ok: true,
		settlementId: typeof json?.settlementId === 'string' ? json.settlementId : undefined,
		transaction: typeof json?.transaction === 'string' ? json.transaction : undefined,
		network: typeof json?.network === 'string' ? json.network : undefined,
		payer: typeof json?.payer === 'string' ? json.payer : undefined
	};
}
