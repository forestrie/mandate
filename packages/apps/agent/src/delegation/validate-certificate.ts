import {
	parseDelegationCertificate,
	verifyDelegationCertificateKs256
} from '@forestrie/delegation-cose';
import type { DelegationRequiredEvent } from '@mandate/coordinator-types';
import { parseEthAddress } from '../bytes.js';

export class CertificateValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'CertificateValidationError';
	}
}

export async function assertCertificateMatchesEvent(opts: {
	certificate: Uint8Array;
	event: Pick<DelegationRequiredEvent, 'logId' | 'mmrStart' | 'mmrEnd'>;
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
}
