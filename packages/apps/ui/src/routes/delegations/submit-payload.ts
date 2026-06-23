import type { PendingEntry } from '@mandate/coordinator-types';
import type { SubmitMaterialRequest } from '@mandate/coordinator-types';

/** Build coordinator material submit body from pending entry and certificate bytes. */
export function buildSubmitMaterialBody(
	entry: PendingEntry,
	certificateBase64: string,
	nowSeconds: number,
	ttlSeconds = 86400
): SubmitMaterialRequest {
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
