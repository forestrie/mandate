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
