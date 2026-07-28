/**
 * Browser client for canopy's payer/owner-facing payment routes (FOR-485).
 *
 * Unlike the coordinator, canopy is called DIRECTLY from the browser — its
 * CORS policy admits exactly `Content-Type` and `Authorization`, and the
 * account read was designed for this client (JSON on `Accept:
 * application/json`, D8 attestation as the only credential — no session, no
 * BFF). The credits purchase is unauthenticated by design: the x402 payment
 * is the authorization.
 */

import { env } from '$env/dynamic/public';

/**
 * Read from `$env/dynamic/public` so an unset var is a call-time error on the
 * fee surface only, never a build error for deployments that don't configure
 * the surface (same posture as `PUBLIC_MANDATE_SIGNER_BACKEND`).
 */
export function canopyApiBase(): string {
	const base = env.PUBLIC_CANOPY_API_URL?.trim().replace(/\/$/, '');
	if (!base) {
		throw new Error('PUBLIC_CANOPY_API_URL is not configured — set it to the canopy API origin');
	}
	return base;
}

/** The attestation `aud` must name the canopy origin the request hits. */
export function canopyOrigin(): string {
	return new URL(canopyApiBase()).origin;
}

export class CanopyRequestError extends Error {
	readonly status: number;
	constructor(status: number, detail: string) {
		super(detail);
		this.name = 'CanopyRequestError';
		this.status = status;
	}
}

/**
 * `GET /api/payments/accounts/{id}` response body. `registrationBlock` is
 * tri-state (canopy plan-2607-07 R2): ABSENT = legacy record with no floor,
 * explicit `null` = the genesis-time floor observation failed and an ops
 * repair is pending. Collapsing the two mislabels legacy accounts.
 */
export interface FeeAccountRead {
	univocityInstanceId: string;
	creditsBalance: number;
	checkpointsAccrued: number;
	arrears: string;
	enforcementFrozen: boolean;
	watermarkBlock: number | null;
	registrationBlock?: number | null;
}

async function errorDetail(response: Response): Promise<string> {
	try {
		const body = (await response.json()) as {
			detail?: string;
			title?: string;
			error?: string;
		};
		return body.detail ?? body.error ?? body.title ?? response.statusText;
	} catch {
		return response.statusText || `HTTP ${response.status}`;
	}
}

/**
 * Fetch the fee-account read. `authorization` is the minted
 * `Forestrie-Account-Read` header value — a live credential; never log it.
 */
export async function fetchFeeAccount(
	univocityInstanceId: string,
	authorization: string
): Promise<FeeAccountRead> {
	const url = `${canopyApiBase()}/api/payments/accounts/${encodeURIComponent(univocityInstanceId)}`;
	const response = await fetch(url, {
		headers: {
			Accept: 'application/json',
			Authorization: authorization
		}
	});
	if (!response.ok) {
		throw new CanopyRequestError(response.status, await errorDetail(response));
	}
	return (await response.json()) as FeeAccountRead;
}

/** The 402 challenge for a credits purchase, price included. */
export interface CreditsChallenge {
	credits: number;
	amountAtomic: string;
	/** Base64 `X-PAYMENT-REQUIRED` header value to sign against. */
	paymentRequiredB64: string;
}

/** Accepted purchase (202): credits land only after on-chain settlement. */
export interface CreditsAccepted {
	credits: number;
	amountAtomic: string;
	settlement: string;
}

function creditsUrl(univocityInstanceId: string, credits: number): string {
	return `${canopyApiBase()}/api/payments/credits/${encodeURIComponent(univocityInstanceId)}?credits=${credits}`;
}

/**
 * Ask for the x402 challenge (expected 402). A 409 means the instance is
 * reserved but not yet registered; 404 means canopy has never seen it.
 */
export async function requestCreditsChallenge(
	univocityInstanceId: string,
	credits: number
): Promise<CreditsChallenge> {
	const response = await fetch(creditsUrl(univocityInstanceId, credits), { method: 'POST' });
	if (response.status !== 402) {
		throw new CanopyRequestError(response.status, await errorDetail(response));
	}
	const paymentRequiredB64 = response.headers.get('X-PAYMENT-REQUIRED');
	const body = (await response.json()) as { credits: number; amountAtomic: string };
	if (!paymentRequiredB64) {
		throw new CanopyRequestError(402, 'challenge missing X-PAYMENT-REQUIRED header');
	}
	return { credits: body.credits, amountAtomic: body.amountAtomic, paymentRequiredB64 };
}

/** Re-POST with the signed payment; 202 means settlement is enqueued. */
export async function submitCreditsPayment(
	univocityInstanceId: string,
	credits: number,
	xPaymentB64: string
): Promise<CreditsAccepted> {
	const response = await fetch(creditsUrl(univocityInstanceId, credits), {
		method: 'POST',
		headers: { 'X-PAYMENT': xPaymentB64 }
	});
	if (response.status !== 202) {
		throw new CanopyRequestError(response.status, await errorDetail(response));
	}
	return (await response.json()) as CreditsAccepted;
}
