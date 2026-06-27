import type { LogSignerDescriptor } from './log-signer-descriptor.js';

export function resolveRemoteBearerToken(
	descriptor: LogSignerDescriptor,
	mandateSignerToken: string,
	remoteBearerEnv: Record<string, string | undefined>
): string {
	if (descriptor.bearerEnvKey) {
		const token = remoteBearerEnv[descriptor.bearerEnvKey];
		if (!token) {
			throw new Error(
				`remote bearer env ${descriptor.bearerEnvKey} is required but empty`
			);
		}
		return token;
	}
	if (!mandateSignerToken) {
		throw new Error('MANDATE_SIGNER_TOKEN is required for remote signing');
	}
	return mandateSignerToken;
}
