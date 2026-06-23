import type { SubmitDelegationCertificateRequest } from '@mandate/coordinator-types';
import { assertSameOrigin, bytesToBase64 } from '../bytes.js';
import { parseDelegationCertificate } from '@forestrie/delegation-cose';

export async function submitDelegationCertificate(opts: {
	certificateSubmitUrl: string;
	coordinatorUpstreamUrl: string;
	logId: string;
	mmrStart: number;
	mmrEnd: number;
	delegatedPublicKeyBase64: string;
	certificate: Uint8Array;
	fetchImpl?: typeof fetch;
}): Promise<Response> {
	const allowedOrigin = new URL(opts.coordinatorUpstreamUrl).origin;
	assertSameOrigin(opts.certificateSubmitUrl, allowedOrigin);

	const info = parseDelegationCertificate(opts.certificate);
	const body: SubmitDelegationCertificateRequest = {
		logId: opts.logId,
		mmrStart: opts.mmrStart,
		mmrEnd: opts.mmrEnd,
		delegatedPublicKey: opts.delegatedPublicKeyBase64,
		certificate: bytesToBase64(opts.certificate),
		issuedAt: info.issuedAt,
		expiresAt: info.expiresAt
	};

	return (opts.fetchImpl ?? fetch)(opts.certificateSubmitUrl, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	});
}

/** @deprecated use submitDelegationCertificate */
export async function submitDelegationMaterial(opts: {
	materialSubmitUrl: string;
	coordinatorUpstreamUrl: string;
	coordinatorAppToken: string;
	logId: string;
	mmrStart: number;
	mmrEnd: number;
	delegatedPublicKeyBase64: string;
	certificate: Uint8Array;
	fetchImpl?: typeof fetch;
}): Promise<Response> {
	void opts.coordinatorAppToken;
	return submitDelegationCertificate({
		certificateSubmitUrl: opts.materialSubmitUrl,
		coordinatorUpstreamUrl: opts.coordinatorUpstreamUrl,
		logId: opts.logId,
		mmrStart: opts.mmrStart,
		mmrEnd: opts.mmrEnd,
		delegatedPublicKeyBase64: opts.delegatedPublicKeyBase64,
		certificate: opts.certificate,
		fetchImpl: opts.fetchImpl
	});
}
