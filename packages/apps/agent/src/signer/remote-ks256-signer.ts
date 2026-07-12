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
		// FOR-311: per-step labels retained as observability — a signer_failed here
		// gives the tail the exact failing operation + stack (this is how the fetch
		// method-call bug below was finally pinned).
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
			// Call via a local free variable, NOT `this.fetchImpl(...)`. resolveSigner
			// passes the bare global `fetch` explicitly (its own default), and invoking
			// the global fetch as a method — `this.fetchImpl(...)` — sets `this` to this
			// instance, which the Workers runtime rejects with "Illegal invocation". A
			// free call leaves the global fetch correctly bound (this is exactly why the
			// JWKS fetch, which calls its impl as a free variable, never failed).
			const doFetch = this.fetchImpl;
			const response = await doFetch(this.descriptor.signerUrl!, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${this.bearerToken}`
				},
				body: bodyStr
			});
			step = 'response.ok';
			if (!response.ok) {
				// Include the signer's error body — a bare status hid why post-exit
				// signs were rejected (FOR-311: e.g. keystore "unknown logId/keyRef").
				const detail = await response.text().catch(() => '');
				throw new Error(`remote signer failed: ${response.status} ${detail.slice(0, 200)}`);
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
