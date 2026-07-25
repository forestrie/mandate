import {
	PaymentConfigError,
	X402_HEADERS,
	buildPaymentRequirements,
	encodePaymentRequiredHeader,
	parsePaymentHeader,
	resolveOperatorPaymentConfig,
	settlePayment,
	verifyPayment,
	type OperatorPaymentConfig,
	type OperatorPaymentEnv
} from '@mandate/x402';
import {
	GrantRequestError,
	parseGrantRequest,
	type GrantIssuer,
	type GrantRequest
} from './grant-request.js';

/**
 * `POST /grants` — the forked operator's own paid grant surface (FOR-428,
 * plan-2607-36 M5, plan-2607-43 A5).
 *
 * The operator collects directly, at its own address, on its own chain, at its
 * own price. Canopy is not in this path: nothing here is reported to, resolved
 * from, or observable by the coordinator, so canopy learns nothing about this
 * operator's customer pricing or payees (ADR-0058 §8).
 *
 * ## Payment gates issuance ONLY (ARC-0022 I7)
 *
 * This is an issuance path and the only place in mandate that consults payment
 * state. No verification path — webhook signature verification, certificate
 * validation, signer resolution, sealing — reads it, imports it, or can be made
 * to depend on it. `test/payment-plane-independence.test.ts` asserts that
 * mechanically; if a payment check ever appears in a verify path, that test
 * fails.
 *
 * ## Order of operations
 *
 * 1. Resolve the operator's settlement config — **fail closed** (503) if unset.
 * 2. Parse the grant request (400).
 * 3. No `X-PAYMENT` → 402 with this operator's challenge.
 * 4. Parse `X-PAYMENT` against this operator's terms → 402 on mismatch.
 * 5. Facilitator `verify` → 402 if it would not settle. No money has moved.
 * 6. **Issue the grant.** Not wired yet (M2) → 501, still before settlement.
 * 7. Facilitator `settle` → 502 on failure.
 * 8. 200 with the grant and `X-PAYMENT-RESPONSE`.
 *
 * Steps 6 and 7 are in that order on purpose: a customer is never charged for a
 * grant that was not produced.
 */

export interface GrantRequestDeps {
	/** The operator's settlement configuration, read from Worker env. */
	paymentEnv: OperatorPaymentEnv;
	/**
	 * Grant construction/signing. Absent until plan-2607-36 M2 lands; the route
	 * then refuses before settling rather than charging for nothing.
	 */
	grantIssuer?: GrantIssuer;
	/** Optional bearer for facilitators that require credentials. */
	facilitatorAuthorization?: string;
	fetchImpl?: typeof fetch;
}

export async function handleGrantRequest(
	request: Request,
	deps: GrantRequestDeps
): Promise<Response> {
	// 1. Fail closed. An operator that has not configured a payee must not
	//    silently settle to someone else's address — so it does not settle at
	//    all, and does not advertise a price it cannot collect.
	let config: OperatorPaymentConfig;
	try {
		config = resolveOperatorPaymentConfig(deps.paymentEnv);
	} catch (error) {
		if (error instanceof PaymentConfigError) {
			console.error('grant payment not configured:', error.message);
			return json(503, {
				ok: false,
				error: 'grant payment is not configured for this operator'
			});
		}
		throw error;
	}

	// 2. Parse the request.
	let grantRequest: GrantRequest;
	try {
		grantRequest = parseGrantRequest(await request.text());
	} catch (error) {
		if (error instanceof GrantRequestError) {
			return json(400, { ok: false, error: error.message });
		}
		throw error;
	}

	const challenge = () =>
		buildPaymentRequirements(config, {
			url: new URL(request.url).toString(),
			description: `Forestrie ${grantRequest.kind} grant`,
			mimeType: 'application/json'
		});

	// 3. Unpaid: challenge with THIS operator's payTo, price and chain.
	const paymentHeader = request.headers.get(X402_HEADERS.paymentSignature);
	if (!paymentHeader) {
		return paymentRequired(challenge(), 'payment required for grant issuance');
	}

	// 4. Structural validation against this operator's terms.
	const parsed = parsePaymentHeader(paymentHeader, config);
	if (!parsed.ok) {
		return paymentRequired(challenge(), parsed.error);
	}

	// 5. Would it settle? No money moves here.
	const facilitator = {
		config,
		fetchImpl: deps.fetchImpl,
		authorization: deps.facilitatorAuthorization
	};
	const verified = await verifyPayment(facilitator, parsed.value.payload);
	if (!verified.ok) {
		return paymentRequired(challenge(), verified.reason ?? 'payment could not be verified');
	}

	// 6. Produce the goods — before taking the money.
	if (!deps.grantIssuer) {
		console.error('grant issuance not implemented; refusing before settlement');
		return json(501, {
			ok: false,
			error: 'grant issuance is not implemented; no payment was settled'
		});
	}

	let grant;
	try {
		grant = await deps.grantIssuer.issue(grantRequest);
	} catch (error) {
		console.error(
			'grant issuance failed; refusing before settlement',
			error instanceof Error ? error.message : String(error)
		);
		return json(502, { ok: false, error: 'grant issuance failed; no payment was settled' });
	}

	// 7. Now settle.
	const settled = await settlePayment(facilitator, parsed.value.payload);
	if (!settled.ok) {
		console.error('settlement failed after issuance', settled.reason);
		return json(502, { ok: false, error: settled.reason ?? 'settlement failed' });
	}

	// 8. Done.
	return new Response(JSON.stringify({ ok: true, grant }), {
		status: 200,
		headers: {
			'Content-Type': 'application/json',
			[X402_HEADERS.paymentResponse]: btoa(
				JSON.stringify({
					success: true,
					settlementId: settled.settlementId,
					transaction: settled.transaction,
					network: settled.network ?? config.network,
					payer: settled.payer ?? parsed.value.payerAddress
				})
			)
		}
	});
}

function paymentRequired(
	requirements: ReturnType<typeof buildPaymentRequirements>,
	error: string
): Response {
	return new Response(JSON.stringify({ ok: false, error, ...requirements }), {
		status: 402,
		headers: {
			'Content-Type': 'application/json',
			[X402_HEADERS.paymentRequired]: encodePaymentRequiredHeader(requirements)
		}
	});
}

function json(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}
