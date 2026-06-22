import {
	buildDelegationCertificateKs256WithSigner,
	type DelegationInput
} from '@canopy/delegation-cose';
import { base64ToBytes, bytesToBase64, parseEthAddress } from '../bytes.js';
import type { LogSignerDescriptor } from './log-signer-descriptor.js';
import type { DelegationSigner } from './delegation-signer.js';

/**
 * Remote KS256 signer: POST sigStructure bytes to signerUrl, receive 65-byte
 * recoverable secp256k1 signature (base64).
 */
export class RemoteKs256Signer implements DelegationSigner {
	constructor(
		private readonly descriptor: LogSignerDescriptor,
		private readonly fetchImpl: typeof fetch = fetch
	) {
		if (descriptor.kind !== 'remote' || !descriptor.signerUrl) {
			throw new Error('RemoteKs256Signer requires kind=remote and signerUrl');
		}
	}

	async buildCertificate(input: DelegationInput): Promise<Uint8Array> {
		const rootSignerAddress = parseEthAddress(this.descriptor.rootSignerAddress);
		return buildDelegationCertificateKs256WithSigner(
			input,
			rootSignerAddress,
			(sigStructureBytes) => this.signRemote(sigStructureBytes)
		);
	}

	private async signRemote(sigStructureBytes: Uint8Array): Promise<Uint8Array> {
		const response = await this.fetchImpl(this.descriptor.signerUrl!, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				sigStructure: bytesToBase64(sigStructureBytes)
			})
		});
		if (!response.ok) {
			throw new Error(`remote signer failed: ${response.status}`);
		}
		const body = (await response.json()) as { signature: string };
		const signature = base64ToBytes(body.signature);
		if (signature.length !== 65) {
			throw new Error('remote signature must be 65 bytes');
		}
		return signature;
	}
}
