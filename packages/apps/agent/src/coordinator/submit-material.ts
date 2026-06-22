import type { SubmitMaterialRequest } from '@mandate/coordinator-types';
import { assertSameOrigin, bytesToBase64 } from '../bytes.js';
import { parseDelegationCertificate } from '@canopy/delegation-cose';

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
	const allowedOrigin = new URL(opts.coordinatorUpstreamUrl).origin;
	assertSameOrigin(opts.materialSubmitUrl, allowedOrigin);

	const info = parseDelegationCertificate(opts.certificate);
	const body: SubmitMaterialRequest = {
		logId: opts.logId,
		mmrStart: opts.mmrStart,
		mmrEnd: opts.mmrEnd,
		delegatedPublicKey: opts.delegatedPublicKeyBase64,
		certificate: bytesToBase64(opts.certificate),
		issuedAt: info.issuedAt,
		expiresAt: info.expiresAt
	};

	return (opts.fetchImpl ?? fetch)(opts.materialSubmitUrl, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${opts.coordinatorAppToken}`
		},
		body: JSON.stringify(body)
	});
}
