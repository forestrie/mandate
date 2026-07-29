import {
	buildDelegationCertificateKs256WithSigner,
	type DelegationInput
} from '@forestrie/delegation-cose';
import type { PendingEntry } from '@mandate/coordinator-types';
import { base64ToBytes } from './bytes.js';
import { parseEthAddress } from './ks256-sig-utils.js';
import type { SigningBackend } from './signing-backend.js';

export function pendingEntryToDelegationInput(
	entry: PendingEntry,
	issuedAt?: number,
	ttlSeconds = 3600
): DelegationInput {
	const now = issuedAt ?? Math.floor(Date.now() / 1000);
	return {
		logIdHex32: entry.logIdHex32,
		mmrStart: entry.mmrStart,
		mmrEnd: entry.mmrEnd,
		delegatedPublicKeyCbor: base64ToBytes(entry.delegatedPublicKey),
		issuedAt: now,
		expiresAt: now + ttlSeconds,
		ttlSeconds
	};
}

/**
 * Build a KS256 COSE Sign1 delegation certificate via an external signer
 * backend. The backend's wire signature is embedded verbatim — a Safe
 * backend's owner signature (v ∈ {27,28}) must reach the on-chain
 * `isValidSignature` untouched, so no normalisation happens here.
 */
export async function buildBrowserDelegationCertificate(
	input: DelegationInput,
	rootSignerAddressHex: string,
	backend: SigningBackend
): Promise<Uint8Array> {
	const rootSignerAddress = parseEthAddress(rootSignerAddressHex);
	return buildDelegationCertificateKs256WithSigner(input, rootSignerAddress, (sigStructureBytes) =>
		backend.signKs256SigStructure(sigStructureBytes)
	);
}
