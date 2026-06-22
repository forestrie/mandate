import type { PolicyRule } from './policy-rule.js';

/** Body for `POST /v1/policies` (Privy policy create). */
export interface PolicyCreateRequest {
	version: '1.0';
	name: string;
	chain_type: 'ethereum';
	rules: PolicyRule[];
}
