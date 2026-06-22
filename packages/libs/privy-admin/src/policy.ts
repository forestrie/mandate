import { DELEGATION_SIGN_METHOD, DENIED_MODE_C_POLICY_METHODS } from './policy-method.js';
import type { PolicyCreateRequest } from './policy-create-request.js';
import type { PolicyRule } from './policy-rule.js';
import type { PolicyResponse } from './policy-response.js';
import type { PrivyRestClient } from './privy-rest.js';

const DEFAULT_POLICY_NAME = 'Mandate Mode C delegation signing';

/**
 * Canonical Privy override policy for Mode C mandate additional signers (FOR-116).
 *
 * Posture: Privy default-deny. One ALLOW rule for `secp256k1_sign` (delegation
 * payload hashes via mandate-signer). Explicit DENY rules for transfers, exports,
 * and structured signing methods.
 *
 * Residual (ARC-0022 §12): Privy cannot filter raw hash *content* — only method
 * class. Payload binding is enforced by the delegation certificate and coordinator.
 */
export function buildDelegationSigningPolicy(
	name: string = DEFAULT_POLICY_NAME
): PolicyCreateRequest {
	const rules: PolicyRule[] = [
		{
			name: 'Allow delegation secp256k1_sign',
			method: DELEGATION_SIGN_METHOD,
			conditions: [],
			action: 'ALLOW'
		},
		...DENIED_MODE_C_POLICY_METHODS.map((method) => ({
			name: `Deny ${method}`,
			method,
			conditions: [],
			action: 'DENY' as const
		}))
	];

	return {
		version: '1.0',
		name,
		chain_type: 'ethereum',
		rules
	};
}

/** Create the Mode C delegation-signing policy in Privy. */
export async function createDelegationSigningPolicy(
	client: PrivyRestClient,
	name?: string
): Promise<PolicyResponse> {
	const body = buildDelegationSigningPolicy(name);
	return client.createPolicy(body);
}
