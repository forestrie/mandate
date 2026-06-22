import {
	DELEGATION_POLICY_ALLOW_METHOD,
	DENIED_MODE_C_POLICY_METHODS,
	ETHEREUM_POLICY_DENY_CHAIN_IDS
} from './policy-method.js';
import type { PolicyCreateRequest } from './policy-create-request.js';
import type { PolicyCondition } from './policy-rule.js';
import type { PolicyRule } from './policy-rule.js';
import type { PolicyResponse } from './policy-response.js';
import type { PrivyRestClient } from './privy-rest.js';

const DEFAULT_POLICY_NAME = 'Mandate Mode C delegation signing';

const ETHEREUM_TX_CHAIN_DENY_CONDITION: PolicyCondition = {
	field_source: 'ethereum_transaction',
	field: 'chain_id',
	operator: 'in',
	value: [...ETHEREUM_POLICY_DENY_CHAIN_IDS]
};

const PERSONAL_SIGN_DENY_CONDITION: PolicyCondition = {
	field_source: 'message',
	field: 'byte_length',
	operator: 'gte',
	value: '1'
};

const EARN_AMOUNT_DENY_CONDITION: PolicyCondition = {
	field_source: 'action_request_body',
	field: 'amount',
	operator: 'gte',
	value: '0'
};

const ETH_SIGN7702_DENY_CONDITION: PolicyCondition = {
	field_source: 'ethereum_7702_authorization',
	field: 'contract',
	operator: 'eq',
	value: '0x0000000000000000000000000000000000000001'
};

function denyConditionsForMethod(
	method: (typeof DENIED_MODE_C_POLICY_METHODS)[number]
): PolicyCondition[] {
	switch (method) {
		case 'exportPrivateKey':
		case 'exportSeedPhrase':
			return [];
		case 'eth_sendTransaction':
		case 'eth_signTransaction':
		case 'eth_signUserOperation':
		case 'wallet_sendCalls':
			return [ETHEREUM_TX_CHAIN_DENY_CONDITION];
		case 'personal_sign':
			return [PERSONAL_SIGN_DENY_CONDITION];
		case 'eth_signTypedData_v4':
			return ETHEREUM_POLICY_DENY_CHAIN_IDS.map((chainId) => ({
				field_source: 'ethereum_typed_data_domain',
				field: 'chainId',
				operator: 'eq',
				value: chainId
			}));
		case 'eth_sign7702Authorization':
			return [ETH_SIGN7702_DENY_CONDITION];
		case 'earn_deposit':
		case 'earn_withdraw':
			return [EARN_AMOUNT_DENY_CONDITION];
		default:
			return [];
	}
}

function buildDeniedModeCRules(): PolicyRule[] {
	const rules: PolicyRule[] = [];

	for (const method of DENIED_MODE_C_POLICY_METHODS) {
		const conditions = denyConditionsForMethod(method);
		if (method === 'eth_signTypedData_v4') {
			for (const condition of conditions) {
				rules.push({
					name: `Deny ${method} chain ${condition.value}`,
					method,
					conditions: [condition],
					action: 'DENY'
				});
			}
			continue;
		}

		rules.push({
			name: `Deny ${method}`,
			method,
			conditions,
			action: 'DENY'
		});
	}

	return rules;
}

/**
 * Canonical Privy override policy for Mode C mandate additional signers (FOR-116).
 *
 * Posture: ALLOW `*` (covers `secp256k1_sign` / raw hash signing) plus explicit
 * DENY rules for transfers, exports, and structured signing. Privy cannot
 * filter raw hash content (ARC-0022 §12 residual).
 */
export function buildDelegationSigningPolicy(
	name: string = DEFAULT_POLICY_NAME
): PolicyCreateRequest {
	return {
		version: '1.0',
		name,
		chain_type: 'ethereum',
		rules: [
			{
				name: 'Allow delegation signing',
				method: DELEGATION_POLICY_ALLOW_METHOD,
				conditions: [],
				action: 'ALLOW'
			},
			...buildDeniedModeCRules()
		]
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
