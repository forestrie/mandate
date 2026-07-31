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

/*
 * x402 payment carve-out: NOT EXPRESSIBLE, and NOT NEEDED — findings from
 * the live experiment against dev policy lzkoqq63xthdr98y6tlfo8yx
 * (2026-07-31):
 *
 * - Privy's condition operators are eq/gt/gte/lt/lte/in/in_condition_set/
 *   contains/starts_with/ends_with — there is NO negation, so a deny cannot
 *   be narrowed to "every domain except USDC" (a `neq` rule 400s at PATCH,
 *   failing closed). Rule names cap at 50 characters.
 * - Privy is strictly DENY-overrides: an ALLOW rule for the USDC domain on
 *   84532, ordered before the per-chain deny, still loses — both probe
 *   signatures came back `policy_violation`.
 * - It does not matter for payments: this override policy governs
 *   mandate-as-ADDITIONAL-SIGNER actions only. The x402 payers (mandate
 *   /fees and /onboard pay-to-approve) sign with the USER's wallet session
 *   or the Mode D owner EOA (decision Q9 — payment is decoupled from the
 *   signing backend), which this policy never gates.
 *
 * The per-chain typed-data denies therefore stay unconditional.
 */

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
