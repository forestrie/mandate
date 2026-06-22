import type { DelegationRequiredEvent } from '@mandate/coordinator-types';
import { base64ToBytes } from './bytes.js';
import { submitDelegationMaterial } from './coordinator/submit-material.js';
import {
	assertCertificateMatchesEvent,
	CertificateValidationError
} from './delegation/validate-certificate.js';
import type { SeenStore } from './dedup/seen-store.js';
import type { KeyRegistry } from './signer/key-registry.js';
import { UnknownLogSignerError } from './signer/key-registry.js';
import { resolveSigner } from './signer/resolve-signer.js';
import type { JwksResolver } from './webhook/jwks-resolver.js';
import { verifyWebhookSignature, WebhookVerificationError } from './webhook/verify-signature.js';

/** Short TTL while signing/submitting; full TTL applied after successful submit. */
export const REQUEST_KEY_RESERVATION_TTL_SECONDS = 120;

export interface AgentDeps {
	jwksResolver: JwksResolver;
	keyRegistry: KeyRegistry;
	seenStore: SeenStore;
	coordinatorUpstreamUrl: string;
	coordinatorAppToken: string;
	mandateSignerToken: string;
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
	if (
		!event.requestKey ||
		!event.logId ||
		event.mmrStart === undefined ||
		event.mmrEnd === undefined ||
		!event.delegatedPublicKey ||
		!event.materialSubmitUrl
	) {
		throw new BadRequestError('missing required delegation.required fields');
	}
	return event;
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
	if (await deps.seenStore.has(event.requestKey)) {
		return jsonResponse(200, { ok: true, duplicate: true });
	}

	let descriptor;
	try {
		descriptor = deps.keyRegistry.get(event.logId);
	} catch (error) {
		if (error instanceof UnknownLogSignerError) {
			return jsonResponse(404, { ok: false, error: error.message });
		}
		throw error;
	}

	const signer = resolveSigner(
		deps.keyRegistry,
		event.logId,
		deps.mandateSignerToken,
		deps.fetchImpl
	);

	// Reserve before signing to narrow duplicate-webhook races. KV is eventually
	// consistent; coordinator idempotency on material submit remains the hard backstop.
	await deps.seenStore.markSeen(event.requestKey, REQUEST_KEY_RESERVATION_TTL_SECONDS);

	let certificate: Uint8Array;
	try {
		certificate = await signer.buildCertificate({
			logIdHex32: event.logId,
			mmrStart: event.mmrStart,
			mmrEnd: event.mmrEnd,
			delegatedPublicKeyCbor: base64ToBytes(event.delegatedPublicKey),
			ttlSeconds: 3600
		});
	} catch (error) {
		await deps.seenStore.clear(event.requestKey);
		throw error;
	}

	try {
		await assertCertificateMatchesEvent({
			certificate,
			event,
			rootSignerAddress: descriptor.rootSignerAddress
		});
	} catch (error) {
		await deps.seenStore.clear(event.requestKey);
		if (error instanceof CertificateValidationError) {
			return jsonResponse(502, { ok: false, error: error.message });
		}
		throw error;
	}

	const submitResponse = await submitDelegationMaterial({
		materialSubmitUrl: event.materialSubmitUrl,
		coordinatorUpstreamUrl: deps.coordinatorUpstreamUrl,
		coordinatorAppToken: deps.coordinatorAppToken,
		logId: event.logId,
		mmrStart: event.mmrStart,
		mmrEnd: event.mmrEnd,
		delegatedPublicKeyBase64: event.delegatedPublicKey,
		certificate,
		fetchImpl: deps.fetchImpl
	});

	if (!submitResponse.ok) {
		await deps.seenStore.clear(event.requestKey);
		const detail = await submitResponse.text();
		return jsonResponse(502, {
			ok: false,
			error: `material submit failed: ${submitResponse.status} ${detail}`
		});
	}

	await deps.seenStore.markSeen(event.requestKey);
	return jsonResponse(200, { ok: true });
}

function jsonResponse(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}
