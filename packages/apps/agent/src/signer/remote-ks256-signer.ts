import {
	buildDelegationCertificateKs256WithSigner,
	type DelegationInput
} from '@forestrie/delegation-cose';
import type { SignRequest } from '@mandate/signer-contract';
import { base64ToBytes, bytesToBase64, parseEthAddress } from '../bytes.js';
import type { LogSignerDescriptor } from './log-signer-descriptor.js';
import type { DelegationSigner } from './delegation-signer.js';
import { resolveRemoteBearerToken } from './resolve-remote-bearer.js';

/**
 * Remote KS256 signer: POST ADR-0003 SignRequest to signerUrl with bearer auth.
 */
export class RemoteKs256Signer implements DelegationSigner {
	private readonly bearerToken: string;

	constructor(
		private readonly descriptor: LogSignerDescriptor,
		mandateSignerToken: string,
		// FOR-311: default must be a wrapper, NOT the bare global `fetch`. Stored on
		// the instance and later called as `this.fetchImpl(...)`, a bare `fetch`
		// reference loses its `globalThis` binding and the Workers runtime throws
		// "Illegal invocation: function called with incorrect `this` reference",
		// which surfaced as every post-exit remote sign failing (signer_failed
		// buildCertificate). The closure calls the free global `fetch`, so the
		// instance `this` is irrelevant.
		private readonly fetchImpl: typeof fetch = (input, init) => fetch(input, init),
		remoteBearerEnv: Record<string, string | undefined> = {}
	) {
		if (descriptor.kind !== 'remote' || !descriptor.signerUrl || !descriptor.keyRef) {
			throw new Error('RemoteKs256Signer requires kind=remote, signerUrl, and keyRef');
		}
		this.bearerToken = resolveRemoteBearerToken(descriptor, mandateSignerToken, remoteBearerEnv);
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
		// FOR-311 diagnostic: per-step labels so the tail names the exact operation
		// that throws "Illegal invocation" (fetch/btoa/json all previously "fixed"
		// with no effect — the line-number inference is unreliable, so isolate it).
		let step = 'sigStructure(bytesToBase64)';
		try {
			const requestBody: SignRequest = {
				logId: logIdHex32,
				keyRef: this.descriptor.keyRef!,
				rootSignerAddress: this.descriptor.rootSignerAddress,
				sigStructure: bytesToBase64(sigStructureBytes)
			};
			step = 'JSON.stringify(body)';
			const bodyStr = JSON.stringify(requestBody);
			step = 'fetch(signerUrl)';
			const response = await this.fetchImpl(this.descriptor.signerUrl!, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${this.bearerToken}`
				},
				body: bodyStr
			});
			step = 'response.ok';
			if (!response.ok) {
				throw new Error(`remote signer failed: ${response.status}`);
			}
			step = 'response.json()';
			const body = (await response.json()) as { signature: string };
			step = 'base64ToBytes(signature)';
			const signature = base64ToBytes(body.signature);
			if (signature.length !== 65) {
				throw new Error('remote signature must be 65 bytes');
			}
			return signature;
		} catch (error) {
			console.error(
				'signRemote_step_failed',
				step,
				error instanceof Error ? (error.stack ?? error.message) : String(error)
			);
			throw error;
		}
	}
}
