import type { PolicyRule } from './policy-rule.js';

/** Privy policy object returned by create/get APIs. */
export interface PolicyResponse {
	id: string;
	version: string;
	name: string;
	chain_type: string;
	rules: Array<PolicyRule & { id?: string }>;
}
