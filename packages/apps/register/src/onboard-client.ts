/** Self-service onboard request client (FOR-173). */

import { cborIntKeyBytes, decodeCborRecord } from './canopy-cbor.js';

const CBOR_LABEL = 1;
const CBOR_CHAIN_ID = 2;
const CBOR_UNIVOCITY_ADDR = 3;
const CBOR_CONTACT_EMAIL = 4;
const CBOR_MANDATE_ORIGIN = 5;
/** COSE_Sign1 bootstrap-key attestation bytes (ADR-0059 D8, FOR-484). */
const CBOR_ATTESTATION = 7;
const CBOR_REDEEM_CODE = 1;

export interface RequestOnboardOptions {
	canopyBaseUrl: string;
	label: string;
	chainId: string;
	univocityAddr: string;
	contactEmail: string;
	mandateOrigin?: string;
	/**
	 * Bootstrap-key registrant attestation (see `onboard-attestation.ts`).
	 * Required by canopy wherever ONBOARD_REQUIRE_KEY_ATTESTATION is armed
	 * (dev, since 2026-07-27); verified whenever present.
	 */
	attestation?: Uint8Array;
	fetchImpl?: typeof fetch;
}

export interface RequestOnboardResult {
	requestId: string;
	status: string;
	expiresAt: number;
	redeemCode: string;
}

export interface RedeemOnboardOptions {
	canopyBaseUrl: string;
	requestId: string;
	redeemCode: string;
	/**
	 * Base64 x402 `X-PAYMENT` header value (FOR-511). Under canopy's
	 * `paid`/`either` admission a valid payment approves a pending request
	 * in the same redeem call; without one a pending redeem answers 402
	 * with the `X-PAYMENT-REQUIRED` challenge
	 * ({@link OnboardPaymentRequiredError}).
	 */
	paymentHeader?: string;
	fetchImpl?: typeof fetch;
}

export interface OnboardStatusResult {
	requestId: string;
	status: string;
	expiresAt?: number;
	onboardTokenRef?: string;
}

async function decodeCborResponse(res: Response): Promise<Record<string, unknown>> {
	return decodeCborRecord(new Uint8Array(await res.arrayBuffer()));
}

function normalizeBase(base: string): string {
	return base.trim().replace(/\/$/, '');
}

export async function requestOnboardToken(
	opts: RequestOnboardOptions
): Promise<RequestOnboardResult> {
	const fetchImpl = opts.fetchImpl ?? fetch;
	const body = new Map<number, unknown>([
		[CBOR_LABEL, opts.label],
		[CBOR_CHAIN_ID, opts.chainId],
		[CBOR_UNIVOCITY_ADDR, opts.univocityAddr.replace(/^0x/i, '')],
		[CBOR_CONTACT_EMAIL, opts.contactEmail]
	]);
	if (opts.mandateOrigin) {
		body.set(CBOR_MANDATE_ORIGIN, opts.mandateOrigin);
	}
	if (opts.attestation) {
		body.set(CBOR_ATTESTATION, opts.attestation);
	}

	const response = await fetchImpl(`${normalizeBase(opts.canopyBaseUrl)}/api/onboarding/requests`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/cbor',
			Accept: 'application/cbor'
		},
		body: cborIntKeyBytes(body) as unknown as BodyInit
	});

	if (response.status !== 201) {
		const detail = await response.text().catch(() => '');
		throw new Error(
			`request onboard: expected 201, got ${response.status}: ${detail.slice(0, 300)}`
		);
	}

	const parsed = await decodeCborResponse(response);
	return {
		requestId: String(parsed.requestId),
		status: String(parsed.status),
		expiresAt: Number(parsed.expiresAt),
		redeemCode: String(parsed.redeemCode)
	};
}

export async function getOnboardRequestStatus(
	canopyBaseUrl: string,
	requestId: string,
	fetchImpl: typeof fetch = fetch
): Promise<OnboardStatusResult> {
	const response = await fetchImpl(
		`${normalizeBase(canopyBaseUrl)}/api/onboarding/requests/${encodeURIComponent(requestId)}`,
		{ headers: { Accept: 'application/cbor' } }
	);
	if (response.status !== 200) {
		throw new Error(`onboard status: expected 200, got ${response.status}`);
	}
	const parsed = await decodeCborResponse(response);
	return {
		requestId: String(parsed.requestId),
		status: String(parsed.status),
		expiresAt: parsed.expiresAt != null ? Number(parsed.expiresAt) : undefined,
		onboardTokenRef: typeof parsed.onboardTokenRef === 'string' ? parsed.onboardTokenRef : undefined
	};
}

/**
 * Redeem failure carrying the HTTP status so callers can distinguish the
 * terminal 410 (request expired — the code no longer re-issues a token,
 * plan-2607-46 slice 02) from retryable outcomes (409 contention, 5xx).
 */
export class OnboardRedeemError extends Error {
	constructor(
		message: string,
		readonly status: number,
		readonly detail?: string
	) {
		super(message);
		this.name = 'OnboardRedeemError';
	}
}

/**
 * The 402 redeem outcome (FOR-511): this deployment approves paid requests,
 * and the response carried the x402 challenge to sign. Distinct from the
 * base class because a bare retry can never succeed — retrying without a
 * payment yields the same 402 forever; the caller either pays (sign the
 * challenge, redeem again with `paymentHeader`) or waits for ops approval.
 */
export class OnboardPaymentRequiredError extends OnboardRedeemError {
	constructor(
		message: string,
		/** Base64 `X-PAYMENT-REQUIRED` header value — parse for price/asset/payTo. */
		readonly challengeB64: string,
		detail?: string
	) {
		super(message, 402, detail);
		this.name = 'OnboardPaymentRequiredError';
	}
}

export async function redeemOnboardToken(opts: RedeemOnboardOptions): Promise<string> {
	const fetchImpl = opts.fetchImpl ?? fetch;
	const headers: Record<string, string> = {
		'Content-Type': 'application/cbor',
		Accept: 'application/cbor'
	};
	if (opts.paymentHeader) {
		headers['X-PAYMENT'] = opts.paymentHeader;
	}
	const response = await fetchImpl(
		`${normalizeBase(opts.canopyBaseUrl)}/api/onboarding/requests/${encodeURIComponent(opts.requestId)}/redeem`,
		{
			method: 'POST',
			headers,
			body: cborIntKeyBytes(new Map([[CBOR_REDEEM_CODE, opts.redeemCode]])) as unknown as BodyInit
		}
	);

	if (response.status !== 200) {
		const detail = await response.text().catch(() => '');
		const challengeB64 = response.headers.get('X-PAYMENT-REQUIRED');
		if (response.status === 402 && challengeB64) {
			throw new OnboardPaymentRequiredError(
				`redeem onboard: payment required: ${detail.slice(0, 300)}`,
				challengeB64,
				detail.slice(0, 300)
			);
		}
		throw new OnboardRedeemError(
			`redeem onboard: expected 200, got ${response.status}: ${detail.slice(0, 300)}`,
			response.status,
			detail.slice(0, 300)
		);
	}

	const parsed = await decodeCborResponse(response);
	const token = parsed.token;
	if (typeof token !== 'string' || !token.trim()) {
		throw new Error('redeem onboard: response missing token');
	}
	return token.trim();
}
