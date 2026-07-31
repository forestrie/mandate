import { describe, expect, it } from 'vitest';
import {
	buildDelegationSigningPolicy,
	DELEGATION_POLICY_ALLOW_METHOD,
	DENIED_MODE_C_POLICY_METHODS,
	ETHEREUM_POLICY_DENY_CHAIN_IDS
} from '../src/index.js';

describe('buildDelegationSigningPolicy', () => {
	it('allows delegation signing via wildcard and denies high-risk wallet methods', () => {
		const policy = buildDelegationSigningPolicy();

		expect(policy.version).toBe('1.0');
		expect(policy.chain_type).toBe('ethereum');
		expect(policy.name).toBe('Mandate Mode C delegation signing');

		const allowRule = policy.rules.find((r) => r.method === DELEGATION_POLICY_ALLOW_METHOD);
		expect(allowRule).toMatchObject({
			action: 'ALLOW',
			conditions: []
		});

		for (const method of DENIED_MODE_C_POLICY_METHODS) {
			const denyRules = policy.rules.filter((r) => r.method === method);
			expect(denyRules.length, `missing DENY rule for ${method}`).toBeGreaterThan(0);
			for (const denyRule of denyRules) {
				expect(denyRule.action).toBe('DENY');
			}
		}

		const typedDataDenies = policy.rules.filter((r) => r.method === 'eth_signTypedData_v4');
		expect(typedDataDenies).toHaveLength(ETHEREUM_POLICY_DENY_CHAIN_IDS.length);

		const sendDeny = policy.rules.find((r) => r.method === 'eth_sendTransaction');
		expect(sendDeny?.conditions[0]).toMatchObject({
			field_source: 'ethereum_transaction',
			field: 'chain_id',
			operator: 'in'
		});
	});

	it('uses a custom policy name when provided', () => {
		const policy = buildDelegationSigningPolicy('Custom Mode C policy');
		expect(policy.name).toBe('Custom Mode C policy');
	});

	it('narrows the Base Sepolia typed-data deny to admit the x402 USDC domain', () => {
		const policy = buildDelegationSigningPolicy();
		const typedDataDenies = policy.rules.filter((r) => r.method === 'eth_signTypedData_v4');

		// The 84532 deny carries BOTH conditions: chain matches AND the
		// verifying contract is NOT the canonical Base Sepolia USDC — so the
		// x402 TransferWithAuthorization signature is admitted while every
		// other typed-data domain on that chain stays denied.
		const baseSepolia = typedDataDenies.find((r) =>
			r.conditions.some((c) => c.field === 'chainId' && c.value === '84532')
		);
		expect(baseSepolia).toBeDefined();
		expect(baseSepolia!.action).toBe('DENY');
		expect(baseSepolia!.conditions).toHaveLength(2);
		expect(baseSepolia!.conditions[1]).toMatchObject({
			field_source: 'ethereum_typed_data_domain',
			field: 'verifyingContract',
			operator: 'neq',
			value: '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
		});

		// Every other chain keeps the unconditional per-chain deny — the
		// carve-out is deliberately testnet-only until live-verified.
		for (const rule of typedDataDenies) {
			if (rule === baseSepolia) continue;
			expect(rule.conditions).toHaveLength(1);
			expect(rule.conditions[0]!.field).toBe('chainId');
		}
	});
});
