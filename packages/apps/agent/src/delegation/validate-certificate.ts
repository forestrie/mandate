import { decodeCborDeterministic } from '@forestrie/encoding';
import {
	decodeCoseSign1Parts,
	decodeDelegatedCoseKeyFromBytes,
	normalizeIntKeyedMap,
	parseDelegatedCoseKeyFromPayload,
	parseDelegationCertificate,
	PAYLOAD_DELEGATED_KEY,
	verifyDelegationCertificateKs256
} from '@forestrie/delegation-cose';
import type { DelegationRequiredEvent } from '@mandate/coordinator-types';
import { base64ToBytes, parseEthAddress } from '../bytes.js';

export class CertificateValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'CertificateValidationError';
	}
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) {
		diff |= a[i]! ^ b[i]!;
	}
	return diff === 0;
}

/**
 * Check a freshly-signed certificate before submitting it: valid root
 * signature, bound to the event's log and delegated key, and covering the
 * demanded window when the event states one. Covering, not equal: the
 * agent widens the window it signs (ADR-0050 §2, FOR-612).
 */
export async function assertCertificateCoversEvent(opts: {
	certificate: Uint8Array;
	event: Pick<DelegationRequiredEvent, 'logId' | 'mmrStart' | 'mmrEnd' | 'delegatedPublicKey'>;
	rootSignerAddress: string;
}): Promise<void> {
	const rootSignerAddressBytes = parseEthAddress(opts.rootSignerAddress);
	const verified = await verifyDelegationCertificateKs256(opts.certificate, rootSignerAddressBytes);
	if (!verified) {
		throw new CertificateValidationError('delegation certificate signature invalid');
	}

	const info = parseDelegationCertificate(opts.certificate);
	if (info.logIdHex32.toLowerCase() !== opts.event.logId.toLowerCase()) {
		throw new CertificateValidationError('certificate logId does not match webhook event');
	}
	const { mmrStart, mmrEnd } = opts.event;
	if (mmrStart !== undefined && info.mmrStart > mmrStart) {
		throw new CertificateValidationError(
			`certificate mmrStart ${info.mmrStart} is after demanded mmrStart ${mmrStart}`
		);
	}
	if (mmrEnd !== undefined && info.mmrEnd < mmrEnd) {
		throw new CertificateValidationError(
			`certificate mmrEnd ${info.mmrEnd} is before demanded mmrEnd ${mmrEnd}`
		);
	}

	const expectedKey = parseDelegatedCoseKeyFromPayload(
		decodeDelegatedCoseKeyFromBytes(base64ToBytes(opts.event.delegatedPublicKey))
	);
	const { payloadBytes } = decodeCoseSign1Parts(opts.certificate);
	const payloadMap = normalizeIntKeyedMap(decodeCborDeterministic(payloadBytes));
	const certKey = parseDelegatedCoseKeyFromPayload(payloadMap.get(PAYLOAD_DELEGATED_KEY));
	if (!bytesEqual(expectedKey.x, certKey.x) || !bytesEqual(expectedKey.y, certKey.y)) {
		throw new CertificateValidationError(
			'certificate delegatedPublicKey does not match webhook event'
		);
	}
}
