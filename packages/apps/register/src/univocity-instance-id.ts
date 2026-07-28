/**
 * The canonical univocity instance identifier (devdocs ADR-0059 decision 7):
 * a deployed univocity instance IS its fee account, and the one identifier
 * for both roles is the CAIP-10 rendering, lowercased:
 *
 *     eip155:{decimal chainId}:0x{40 lowercase hex}
 *
 * Semantics mirror canopy's `@canopy/univocity-instance-id` (the authority —
 * keep in lockstep): parsing external input is reject-never-repair; the
 * construction helper normalises trusted internal chain bindings (optional
 * 0x prefix, any hex case) into canonical form. `chainBinding
 * { chainId, univocityAddr }` remains the structured wire form; this module
 * is the only place conversion happens.
 */

/** Canonical form: CAIP-10, eip155 namespace, lowercased. */
const UNIVOCITY_INSTANCE_ID_PATTERN = /^eip155:[1-9][0-9]{0,31}:0x[0-9a-f]{40}$/;

/** Decimal chain id, no leading zeros (CAIP-2 eip155 reference). */
const CHAIN_ID_PATTERN = /^[1-9][0-9]{0,31}$/;

/** 40 hex chars, optional 0x prefix, any case (construction input only). */
const ADDR_INPUT_PATTERN = /^(0x)?[0-9a-fA-F]{40}$/;

export class UnivocityInstanceIdError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'UnivocityInstanceIdError';
	}
}

/** A validated canonical univocity instance id; treat as opaque elsewhere. */
export type UnivocityInstanceId = string;

/** Exact canonical form only — no case folding, no prefix repair. */
export function parseUnivocityInstanceId(value: string): UnivocityInstanceId {
	if (!UNIVOCITY_INSTANCE_ID_PATTERN.test(value)) {
		throw new UnivocityInstanceIdError(
			'not a canonical univocity instance id (expected eip155:{chainId}:0x{40 lowercase hex})'
		);
	}
	return value;
}

/** Non-throwing form check for guards and request validation. */
export function isUnivocityInstanceId(value: string): value is UnivocityInstanceId {
	return UNIVOCITY_INSTANCE_ID_PATTERN.test(value);
}

/**
 * Split a canonical id back into the structured wire form (mirrors canopy's
 * `chainBindingFromUnivocityInstanceId`): bare decimal chainId, 40-lowerhex
 * address body without 0x.
 */
export function chainBindingFromUnivocityInstanceId(id: string): {
	chainId: string;
	univocityAddr: string;
} {
	parseUnivocityInstanceId(id);
	const [, chainId, prefixedAddr] = id.split(':');
	return { chainId: chainId!, univocityAddr: prefixedAddr!.slice(2) };
}

/**
 * Construct from a chain binding (trusted internal input, e.g. the genesis
 * registration response): tolerates an optional 0x prefix and any hex case,
 * renders canonical.
 */
export function univocityInstanceIdFromChainBinding(binding: {
	chainId: string;
	univocityAddr: string;
}): UnivocityInstanceId {
	const chainId = binding.chainId?.trim() ?? '';
	if (!CHAIN_ID_PATTERN.test(chainId)) {
		throw new UnivocityInstanceIdError('chain binding chainId is not a bare decimal chain id');
	}
	const addr = binding.univocityAddr?.trim() ?? '';
	if (!ADDR_INPUT_PATTERN.test(addr)) {
		throw new UnivocityInstanceIdError('chain binding univocityAddr is not a 20-byte hex address');
	}
	const hex40 = addr.replace(/^0x/i, '').toLowerCase();
	return `eip155:${chainId}:0x${hex40}`;
}
