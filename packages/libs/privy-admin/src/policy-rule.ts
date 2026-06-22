import type { PolicyAction } from './policy-action.js';

/** Boolean expression evaluated against an incoming wallet RPC request. */
export interface PolicyCondition {
	field_source: string;
	field: string;
	operator: string;
	value: string | string[];
}

/** Privy policy rule: conditions + ALLOW/DENY action for one RPC method. */
export interface PolicyRule {
	name: string;
	method: string;
	conditions: PolicyCondition[];
	action: PolicyAction;
}
