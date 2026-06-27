import type { PendingEntry, SubmitDelegationCertificateRequest } from '@mandate/coordinator-types';

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
