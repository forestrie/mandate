import { LocalKs256Signer } from './local-ks256-signer.js';
import { RemoteKs256Signer } from './remote-ks256-signer.js';
import type { KeyRegistry } from './key-registry.js';
import type { DelegationSigner } from './delegation-signer.js';

export function resolveSigner(
	registry: KeyRegistry,
	logIdHex32: string,
	mandateSignerToken: string,
	fetchImpl: typeof fetch = fetch,
	remoteBearerEnv: Record<string, string | undefined> = {}
): DelegationSigner {
	const descriptor = registry.get(logIdHex32);
	if (descriptor.kind === 'remote') {
		return new RemoteKs256Signer(descriptor, mandateSignerToken, fetchImpl, remoteBearerEnv);
	}
	return new LocalKs256Signer(descriptor);
}
