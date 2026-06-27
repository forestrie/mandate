import type { PendingEntry, SubmitDelegationCertificateRequest } from '@mandate/coordinator-types';
import { parseDelegationCertificate } from '@forestrie/delegation-cose';
import { bytesToBase64 } from '$lib/signing/bytes.js';

/** Build coordinator certificate submit body from pending entry and COSE cert bytes. */
export function buildSubmitCertificateBodyFromCert(
	entry: PendingEntry,
	certificate: Uint8Array
): SubmitDelegationCertificateRequest {
	const info = parseDelegationCertificate(certificate);
	return {
		logId: entry.logIdHex32,
		mmrStart: entry.mmrStart,
		mmrEnd: entry.mmrEnd,
		delegatedPublicKey: entry.delegatedPublicKey,
		certificate: bytesToBase64(certificate),
		issuedAt: info.issuedAt,
		expiresAt: info.expiresAt
	};
}

/** Build coordinator certificate submit body from pending entry and certificate bytes. */
export function buildSubmitCertificateBody(
	entry: PendingEntry,
	certificateBase64: string,
	nowSeconds: number,
	ttlSeconds = 86400
): SubmitDelegationCertificateRequest {
	return {
		logId: entry.logIdHex32,
		mmrStart: entry.mmrStart,
		mmrEnd: entry.mmrEnd,
		delegatedPublicKey: entry.delegatedPublicKey,
		certificate: certificateBase64,
		issuedAt: nowSeconds,
		expiresAt: nowSeconds + ttlSeconds
	};
}
