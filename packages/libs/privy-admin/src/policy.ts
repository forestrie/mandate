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

const EARN_AMOUNT_DENY_CONDITION: PolicyCondition = {
	field_source: 'action_request_body',
	field: 'amount',
	operator: 'gte',
	value: '0'
};

const TRANSFER_DENY_CONDITION: PolicyCondition = {
	field_source: 'action_request_body',
	field: 'source.amount',
	operator: 'gte',
	value: '0'
};

const ETH_SIGN7702_DENY_CONDITION: PolicyCondition = {
	field_source: 'ethereum_7702_authorization',
	field: 'contract',
	operator: 'eq',
	value: '0x0000000000000000000000000000000000000001'
};

/** Privy requires ≥1 condition on DENY rules; matches all requests. */
const ALWAYS_DENY_SYSTEM_CONDITION: PolicyCondition = {
	field_source: 'system',
	field: 'current_unix_timestamp',
	operator: 'gte',
	value: '0'
};

/**
 * x402 payment allowance (FOR-485 residual): chains where the Mode C wallet
 * may sign typed data in the canonical USDC contract's EIP-712 domain — the
 * `TransferWithAuthorization` a canopy x402 challenge demands. DENY rules
 * override ALLOW in Privy, so the carve-out must NARROW the per-chain deny
 * (chainId matches AND the verifying contract is NOT this USDC), not add an
 * ALLOW rule. Domain scoping is the boundary Privy can express with the
 * vocabulary this repo has live-verified; it admits every primary type in
 * USDC's domain (e.g. EIP-2612 Permit too) — equivalent risk, since the
 * allowance's whole point is letting mandate-signed payments move USDC.
 *
 * Deliberately Base Sepolia ONLY for now: if the `neq` operator or the
 * `verifyingContract` field name is ever wrong, the narrowed rule silently
 * never matches and that chain's typed-data deny fails OPEN — confined here
 * to testnet. Verify with the live policy matrix before adding mainnet
 * entries.
 */
const X402_USDC_DOMAIN_ALLOWANCES: Partial<Record<string, string>> = {
	'84532': '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
};

function denyConditionsForMethod(
	method: (typeof DENIED_MODE_C_POLICY_METHODS)[number]
): PolicyCondition[] {
	switch (method) {
		case 'exportPrivateKey':
		case 'exportSeedPhrase':
		case 'signTransaction':
		case 'signAndSendTransaction':
		case 'signTransactionBytes':
			return [ALWAYS_DENY_SYSTEM_CONDITION];
		case 'eth_sendTransaction':
		case 'eth_signTransaction':
		case 'eth_signUserOperation':
		case 'wallet_sendCalls':
			return [ETHEREUM_TX_CHAIN_DENY_CONDITION];
		case 'transfer':
			return [TRANSFER_DENY_CONDITION];
		case 'personal_sign':
			return [ALWAYS_DENY_SYSTEM_CONDITION];
		case 'eth_signTypedData_v4':
			return ETHEREUM_POLICY_DENY_CHAIN_IDS.map((chainId) => ({
				field_source: 'ethereum_typed_data_domain',
				field: 'chainId',
				operator: 'eq',
				value: chainId
			}));
		// (x402 narrowing for this method happens in buildDeniedModeCRules —
		// the per-chain conditions above are the base shape.)
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
				const usdc = X402_USDC_DOMAIN_ALLOWANCES[String(condition.value)];
				if (usdc) {
					// Narrowed deny: everything on this chain EXCEPT typed data
					// in the canonical USDC domain — the x402 payment signature
					// (see X402_USDC_DOMAIN_ALLOWANCES for the risk posture).
					rules.push({
						name: `Deny ${method} chain ${condition.value} except x402 USDC domain`,
						method,
						conditions: [
							condition,
							{
								field_source: 'ethereum_typed_data_domain',
								field: 'verifyingContract',
								operator: 'neq',
								value: usdc
							}
						],
						action: 'DENY'
					});
					continue;
				}
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
