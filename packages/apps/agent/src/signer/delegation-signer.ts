import type { DelegationInput } from '@forestrie/delegation-cose';

/** Signs delegation certificates for a configured operator forest root. */
export interface DelegationSigner {
	buildCertificate(input: DelegationInput): Promise<Uint8Array>;
}
