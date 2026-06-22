import { describe, expect, it } from 'vitest';
import {
	buildDelegationSigningPolicy,
	DELEGATION_SIGN_METHOD,
	DENIED_MODE_C_POLICY_METHODS
} from '../src/index.js';

describe('buildDelegationSigningPolicy', () => {
	it('allows secp256k1_sign and denies high-risk wallet methods', () => {
		const policy = buildDelegationSigningPolicy();

		expect(policy.version).toBe('1.0');
		expect(policy.chain_type).toBe('ethereum');
		expect(policy.name).toBe('Mandate Mode C delegation signing');

		const allowRule = policy.rules.find((r) => r.method === DELEGATION_SIGN_METHOD);
		expect(allowRule).toMatchObject({
			action: 'ALLOW',
			conditions: []
		});

		for (const method of DENIED_MODE_C_POLICY_METHODS) {
			const denyRule = policy.rules.find((r) => r.method === method);
			expect(denyRule, `missing DENY rule for ${method}`).toMatchObject({
				action: 'DENY',
				conditions: []
			});
		}

		expect(policy.rules).toHaveLength(1 + DENIED_MODE_C_POLICY_METHODS.length);
	});

	it('uses a custom policy name when provided', () => {
		const policy = buildDelegationSigningPolicy('Custom Mode C policy');
		expect(policy.name).toBe('Custom Mode C policy');
	});
});
