import {
	buildDelegationCertificateKs256WithSigner,
	type DelegationInput
} from '@forestrie/delegation-cose';
import type { PendingEntry } from '@mandate/coordinator-types';
import { base64ToBytes } from './bytes.js';
import { normalizeKs256Signature, parseEthAddress } from './ks256-sig-utils.js';
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

/** Build a KS256 COSE Sign1 delegation certificate via an external signer backend. */
export async function buildBrowserDelegationCertificate(
	input: DelegationInput,
	rootSignerAddressHex: string,
	backend: SigningBackend
): Promise<Uint8Array> {
	const rootSignerAddress = parseEthAddress(rootSignerAddressHex);
	return buildDelegationCertificateKs256WithSigner(
		input,
		rootSignerAddress,
		async (sigStructureBytes) => {
			const signatureHex = await backend.signKs256SigStructure(sigStructureBytes);
			return normalizeKs256Signature(signatureHex);
		}
	);
}
