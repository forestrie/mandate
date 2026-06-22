import { buildDelegationCertificateKs256, type DelegationInput } from '@forestrie/delegation-cose';
import { parseEthAddress } from '../bytes.js';
import type { LogSignerDescriptor } from './log-signer-descriptor.js';
import type { DelegationSigner } from './delegation-signer.js';

/** Reference signer holding a raw EOA key — local dev and tests only. */
export class LocalKs256Signer implements DelegationSigner {
	constructor(private readonly descriptor: LogSignerDescriptor) {
		if (descriptor.kind !== 'local' || !descriptor.privateKeyHex) {
			throw new Error('LocalKs256Signer requires kind=local and privateKeyHex');
		}
	}

	async buildCertificate(input: DelegationInput): Promise<Uint8Array> {
		const rootSignerAddress = parseEthAddress(this.descriptor.rootSignerAddress);
		return buildDelegationCertificateKs256(
			input,
			rootSignerAddress,
			this.descriptor.privateKeyHex!
		);
	}
}
