import type { DelegationRequiredEvent } from '@mandate/coordinator-types';
import { base64ToBytes } from './bytes.js';
import { submitDelegationCertificate } from './coordinator/submit-certificate.js';
import {
	assertCertificateMatchesEvent,
	CertificateValidationError
} from './delegation/validate-certificate.js';
import { logDelegationOutcome } from './delegation/delegation-outcome-log.js';
import type { SeenStore } from './dedup/seen-store.js';
import type { KeyRegistry } from './signer/key-registry.js';
import { InteractiveRootSignerError, UnknownLogSignerError } from './signer/key-registry.js';
import { resolveSigner } from './signer/resolve-signer.js';
import type { JwksResolver } from './webhook/jwks-resolver.js';
import { verifyWebhookSignature, WebhookVerificationError } from './webhook/verify-signature.js';

/**
 * Horizon used when the coordinator states no window (ADR-0050 §2).
 *
 * The standing delegate-key delivery is window-less BY DESIGN — it means "you
 * choose the bounds", not "the event is malformed". Signers sign over a
 * horizon and TTL of their choosing, conventionally `mmrStart = 0`. 2^16-1
 * matches the convention used by the canopy e2e kit's advance signer.
 */
export const ADVANCE_MMR_START = 0;
export const ADVANCE_HORIZON_MMR_END = 65535;

/** Short TTL while signing/submitting; full TTL applied after successful submit. */
export const REQUEST_KEY_RESERVATION_TTL_SECONDS = 120;
/** TTL after successful certificate submit (dedup for redelivery). */
export const REQUEST_KEY_SUCCESS_TTL_SECONDS = 3600;

export interface AgentDeps {
	jwksResolver: JwksResolver;
	keyRegistry: KeyRegistry;
	seenStore: SeenStore;
	coordinatorUpstreamUrl: string;
	coordinatorAppToken: string;
	mandateSignerToken: string;
	remoteBearerEnv?: Record<string, string | undefined>;
	fetchImpl?: typeof fetch;
	nowSeconds?: number;
}

export interface DelegationRequiredResult {
	ok: true;
	duplicate?: true;
}

function parseEvent(rawBody: string): DelegationRequiredEvent {
	let parsed: unknown;
	try {
		parsed = JSON.parse(rawBody);
	} catch {
		throw new BadRequestError('invalid JSON body');
	}
	const event = parsed as DelegationRequiredEvent;
	if (event.type !== 'delegation.required' || event.version !== 1) {
		throw new BadRequestError('unsupported delegation.required event');
	}
	const submitUrl = event.certificateSubmitUrl ?? event.materialSubmitUrl;
	if (!event.requestKey || !event.logId || !event.delegatedPublicKey || !submitUrl) {
		throw new BadRequestError('missing required delegation.required fields');
	}
	// mmrStart/mmrEnd are DELIBERATELY not required. ADR-0050 §2: webhook modes
	// receive the same uniform delivery as demand pendings, and the standing
	// delegate-key entry carries no window — the signer supplies its own. This
	// used to 400, so the agent could never perform delegation-in-advance and
	// any log routed to it stalled on "delegation material pending" (FOR-524).
	// A partial window is still malformed: one bound without the other is not
	// a shape the coordinator emits.
	if ((event.mmrStart === undefined) !== (event.mmrEnd === undefined)) {
		throw new BadRequestError(
			'delegation.required must state both mmrStart and mmrEnd, or neither'
		);
	}
	return { ...event, certificateSubmitUrl: submitUrl };
}

export class BadRequestError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'BadRequestError';
	}
}

export async function handleDelegationRequired(
	request: Request,
	deps: AgentDeps
): Promise<Response> {
	const timestamp = request.headers.get('X-Forestrie-Webhook-Timestamp') ?? '';
	const signature = request.headers.get('X-Forestrie-Webhook-Signature') ?? '';
	if (!timestamp || !signature) {
		return jsonResponse(401, { ok: false, error: 'missing webhook signature headers' });
	}

	const rawBody = await request.text();
	try {
		await verifyWebhookSignature({
			timestamp,
			rawBody,
			signatureB64Url: signature,
			jwksResolver: deps.jwksResolver,
			nowSeconds: deps.nowSeconds
		});
	} catch (error) {
		if (error instanceof WebhookVerificationError) {
			return jsonResponse(401, { ok: false, error: error.message });
		}
		throw error;
	}

	let event;
	try {
		event = parseEvent(rawBody);
	} catch (error) {
		if (error instanceof BadRequestError) {
			return jsonResponse(400, { ok: false, error: error.message });
		}
		throw error;
	}

	// Resolve the window ONCE. A window-less (advance) delivery means the signer
	// chooses; every downstream consumer — the certificate, the validator that
	// cross-checks it, and the submission — must see the SAME bounds, or the
	// validator rejects our own freshly-signed certificate.
	const mmrStart = event.mmrStart ?? ADVANCE_MMR_START;
	const mmrEnd = event.mmrEnd ?? ADVANCE_HORIZON_MMR_END;
	if (event.mmrStart === undefined) {
		// Worth saying: this is the delivery the agent used to reject outright, so
		// its presence in logs is the signal that advance signing is working.
		console.log(
			`delegation.required advance (window-less) for log ${event.logId} — ` +
				`signing over [${mmrStart}, ${mmrEnd}]`
		);
	}

	const reservation = await deps.seenStore.tryReserve(
		event.requestKey,
		REQUEST_KEY_RESERVATION_TTL_SECONDS
	);
	if (reservation === 'duplicate') {
		logDelegationOutcome(event, 'duplicate');
		return jsonResponse(200, { ok: true, duplicate: true });
	}

	let descriptor;
	try {
		descriptor = deps.keyRegistry.get(event.logId);
	} catch (error) {
		if (error instanceof UnknownLogSignerError) {
			await deps.seenStore.clear(event.requestKey);
			return jsonResponse(404, { ok: false, error: error.message });
		}
		if (error instanceof InteractiveRootSignerError) {
			// Safe 1x1 (Mode D): the coordinator retries EVERY non-2xx through
			// the full ladder, and this log will never sign via webhook — the
			// root signs in the console (pending queue). Acknowledge with 200 +
			// ok:false so delivery stops now; the demand stays in pending
			// (plan-2607-03 R1; route-aware suppression is FOR-504).
			logDelegationOutcome(event, 'interactive_root');
			await deps.seenStore.clear(event.requestKey);
			return jsonResponse(200, { ok: false, error: error.message });
		}
		throw error;
	}

	let signer;
	try {
		signer = resolveSigner(
			deps.keyRegistry,
			event.logId,
			deps.mandateSignerToken,
			deps.fetchImpl,
			deps.remoteBearerEnv ?? {}
		);
	} catch (error) {
		// FOR-311: surface the swallowed signer-resolve error. A bare catch here
		// hid a runtime empty-bearer throw for six blind conformance runs. Log the
		// message and the bearer-env key presence/length (NOT the value) so the
		// tail distinguishes empty-binding from wrong-value in a single run.
		const bearerEnv = deps.remoteBearerEnv ?? {};
		console.error(
			'signer_failed resolveSigner',
			error instanceof Error ? error.message : String(error),
			'bearerEnvKeys=',
			Object.keys(bearerEnv).join(','),
			'USER_SIGNER_BEARER.len=',
			(bearerEnv.USER_SIGNER_BEARER ?? '').length
		);
		logDelegationOutcome(event, 'signer_failed');
		await deps.seenStore.clear(event.requestKey);
		return jsonResponse(502, { ok: false, error: 'delegation signing failed' });
	}

	let certificate: Uint8Array;
	try {
		certificate = await signer.buildCertificate({
			logIdHex32: event.logId,
			mmrStart,
			mmrEnd,
			delegatedPublicKeyCbor: base64ToBytes(event.delegatedPublicKey),
			ttlSeconds: 3600
		});
	} catch (error) {
		// FOR-311: surface the swallowed buildCertificate error (see resolveSigner
		// catch above). If we reach here the signer resolved (bearer non-empty), so
		// this distinguishes a build/sign-fetch failure from an empty bearer.
		console.error(
			'signer_failed buildCertificate',
			error instanceof Error ? (error.stack ?? error.message) : String(error)
		);
		await deps.seenStore.clear(event.requestKey);
		logDelegationOutcome(event, 'signer_failed');
		return jsonResponse(502, { ok: false, error: 'delegation signing failed' });
	}

	try {
		await assertCertificateMatchesEvent({
			certificate,
			// Resolved bounds, not the raw event: on an advance delivery the event
			// states no window and the certificate necessarily carries the one we
			// chose.
			event: { ...event, mmrStart, mmrEnd },
			rootSignerAddress: descriptor.rootSignerAddress
		});
	} catch (error) {
		await deps.seenStore.clear(event.requestKey);
		if (error instanceof CertificateValidationError) {
			logDelegationOutcome(event, 'certificate_rejected');
			return jsonResponse(502, { ok: false, error: error.message });
		}
		throw error;
	}

	const submitResponse = await submitDelegationCertificate({
		certificateSubmitUrl: event.certificateSubmitUrl,
		coordinatorUpstreamUrl: deps.coordinatorUpstreamUrl,
		logId: event.logId,
		mmrStart,
		mmrEnd,
		delegatedPublicKeyBase64: event.delegatedPublicKey,
		certificate,
		fetchImpl: deps.fetchImpl
	});

	if (!submitResponse.ok) {
		await deps.seenStore.clear(event.requestKey);
		const detail = await submitResponse.text();
		console.error('certificate submit failed', submitResponse.status, detail);
		logDelegationOutcome(event, 'coordinator_rejected', {
			status: submitResponse.status
		});
		return jsonResponse(502, {
			ok: false,
			error: `certificate submit failed: ${submitResponse.status}`
		});
	}

	await deps.seenStore.markSeen(event.requestKey, REQUEST_KEY_SUCCESS_TTL_SECONDS);
	logDelegationOutcome(event, 'signed_and_submitted');
	return jsonResponse(200, { ok: true });
}

function jsonResponse(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}
