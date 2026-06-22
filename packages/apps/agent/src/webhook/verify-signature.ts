import type { JwksResolver, WebhookJwk } from './jwks-resolver.js';

const MAX_SKEW_SECONDS = 300;

function importEs256VerifyKey(jwk: WebhookJwk): Promise<CryptoKey> {
	return crypto.subtle.importKey(
		'jwk',
		{
			kty: jwk.kty,
			crv: jwk.crv,
			x: jwk.x,
			y: jwk.y,
			alg: jwk.alg,
			ext: true
		},
		{ name: 'ECDSA', namedCurve: 'P-256' },
		false,
		['verify']
	);
}

function assertFreshTimestamp(timestamp: string, nowSeconds = Math.floor(Date.now() / 1000)): void {
	const ts = Number(timestamp);
	if (!Number.isFinite(ts)) {
		throw new WebhookVerificationError('invalid webhook timestamp');
	}
	if (Math.abs(nowSeconds - ts) > MAX_SKEW_SECONDS) {
		throw new WebhookVerificationError('webhook timestamp outside allowed skew');
	}
}

export class WebhookVerificationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'WebhookVerificationError';
	}
}

async function verifyWithKey(
	jwk: WebhookJwk,
	timestamp: string,
	rawBody: string,
	signatureB64Url: string
): Promise<boolean> {
	const key = await importEs256VerifyKey(jwk);
	const sigBytes = Uint8Array.from(
		atob(signatureB64Url.replace(/-/g, '+').replace(/_/g, '/')),
		(c) => c.charCodeAt(0)
	);
	return crypto.subtle.verify(
		{ name: 'ECDSA', hash: 'SHA-256' },
		key,
		sigBytes,
		new TextEncoder().encode(`${timestamp}.${rawBody}`)
	);
}

export async function verifyWebhookSignature(opts: {
	timestamp: string;
	rawBody: string;
	signatureB64Url: string;
	jwksResolver: JwksResolver;
	nowSeconds?: number;
}): Promise<void> {
	assertFreshTimestamp(opts.timestamp, opts.nowSeconds);
	let keys = await opts.jwksResolver.resolveVerificationKeys();
	for (const jwk of keys) {
		if (await verifyWithKey(jwk, opts.timestamp, opts.rawBody, opts.signatureB64Url)) {
			return;
		}
	}
	opts.jwksResolver.invalidate();
	keys = await opts.jwksResolver.resolveVerificationKeys();
	for (const jwk of keys) {
		if (await verifyWithKey(jwk, opts.timestamp, opts.rawBody, opts.signatureB64Url)) {
			return;
		}
	}
	throw new WebhookVerificationError('webhook signature invalid');
}
