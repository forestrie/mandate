import { decode } from 'cbor-x';
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

export async function assertCertificateMatchesEvent(opts: {
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
	if (info.mmrStart !== opts.event.mmrStart) {
		throw new CertificateValidationError('certificate mmrStart does not match webhook event');
	}
	if (info.mmrEnd !== opts.event.mmrEnd) {
		throw new CertificateValidationError('certificate mmrEnd does not match webhook event');
	}

	const expectedKey = parseDelegatedCoseKeyFromPayload(
		decodeDelegatedCoseKeyFromBytes(base64ToBytes(opts.event.delegatedPublicKey))
	);
	const { payloadBytes } = decodeCoseSign1Parts(opts.certificate);
	const payloadMap = normalizeIntKeyedMap(decode(payloadBytes));
	const certKey = parseDelegatedCoseKeyFromPayload(payloadMap.get(PAYLOAD_DELEGATED_KEY));
	if (!bytesEqual(expectedKey.x, certKey.x) || !bytesEqual(expectedKey.y, certKey.y)) {
		throw new CertificateValidationError(
			'certificate delegatedPublicKey does not match webhook event'
		);
	}
}
