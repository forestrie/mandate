import {
	buildDelegationCertificateKs256WithSigner,
	type DelegationInput
} from '@canopy/delegation-cose';
import type { SignRequest } from '@mandate/signer-contract';
import { base64ToBytes, bytesToBase64, parseEthAddress } from '../bytes.js';
import type { LogSignerDescriptor } from './log-signer-descriptor.js';
import type { DelegationSigner } from './delegation-signer.js';

/**
 * Remote KS256 signer: POST ADR-0003 SignRequest to signerUrl with bearer auth.
 */
export class RemoteKs256Signer implements DelegationSigner {
	constructor(
		private readonly descriptor: LogSignerDescriptor,
		private readonly mandateSignerToken: string,
		private readonly fetchImpl: typeof fetch = fetch
	) {
		if (descriptor.kind !== 'remote' || !descriptor.signerUrl || !descriptor.keyRef) {
			throw new Error('RemoteKs256Signer requires kind=remote, signerUrl, and keyRef');
		}
		if (!mandateSignerToken) {
			throw new Error('MANDATE_SIGNER_TOKEN is required for remote signing');
		}
	}

	async buildCertificate(input: DelegationInput): Promise<Uint8Array> {
		const rootSignerAddress = parseEthAddress(this.descriptor.rootSignerAddress);
		return buildDelegationCertificateKs256WithSigner(
			input,
			rootSignerAddress,
			(sigStructureBytes) => this.signRemote(input.logIdHex32, sigStructureBytes)
		);
	}

	private async signRemote(logIdHex32: string, sigStructureBytes: Uint8Array): Promise<Uint8Array> {
		const requestBody: SignRequest = {
			logId: logIdHex32,
			keyRef: this.descriptor.keyRef!,
			rootSignerAddress: this.descriptor.rootSignerAddress,
			sigStructure: bytesToBase64(sigStructureBytes)
		};
		const response = await this.fetchImpl(this.descriptor.signerUrl!, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${this.mandateSignerToken}`
			},
			body: JSON.stringify(requestBody)
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
