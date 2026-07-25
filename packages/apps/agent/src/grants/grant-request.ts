/**
 * The customer-facing grant request this operator sells (FOR-428).
 *
 * Deliberately minimal and payment-shaped: it carries only what the operator
 * needs to price and address the sale. The grant *construction* surface (leaf
 * flags, bounds, `@forestrie/grant-builder`) is plan-2607-36 M2 and is not
 * modelled here — see `GrantIssuer`.
 */

/** Grant SKUs a forked operator can sell. */
export type GrantKind = 'endorsement' | 'creation';

const GRANT_KINDS: readonly GrantKind[] = ['endorsement', 'creation'];

export interface GrantRequest {
	version: 1;
	kind: GrantKind;
	/** The customer's forest / log id (hex), i.e. `R'`. */
	forestId: string;
}

/** Result of issuing — opaque here; M2 decides its shape. */
export interface IssuedGrant {
	grantId?: string;
	[key: string]: unknown;
}

/**
 * The seam plan-2607-36 M2 fills in.
 *
 * Mandate has no grant-construction code today, and adding root-key (`K(R)`)
 * grant signing to the agent is an unresolved architecture decision (M1: it
 * must not widen the delegation signer's scope, ARC-0022 I6). So the payment
 * plane is built against this interface rather than against an implementation.
 *
 * The route refuses (501) **before settling** when no issuer is wired, so an
 * operator who deploys the paywall ahead of M2 cannot take money for nothing.
 */
export interface GrantIssuer {
	issue(request: GrantRequest): Promise<IssuedGrant>;
}

const FOREST_ID_HEX = /^[0-9a-fA-F]{2,128}$/;

export class GrantRequestError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'GrantRequestError';
	}
}

/** Parse and validate a grant request body. Throws `GrantRequestError`. */
export function parseGrantRequest(rawBody: string): GrantRequest {
	let parsed: unknown;
	try {
		parsed = JSON.parse(rawBody);
	} catch {
		throw new GrantRequestError('invalid JSON body');
	}
	if (typeof parsed !== 'object' || parsed === null) {
		throw new GrantRequestError('body must be a JSON object');
	}
	const body = parsed as Record<string, unknown>;
	if (body.version !== 1) {
		throw new GrantRequestError('unsupported grant request version');
	}
	if (typeof body.kind !== 'string' || !GRANT_KINDS.includes(body.kind as GrantKind)) {
		throw new GrantRequestError(`kind must be one of: ${GRANT_KINDS.join(', ')}`);
	}
	if (typeof body.forestId !== 'string' || !FOREST_ID_HEX.test(body.forestId)) {
		throw new GrantRequestError('forestId (hex) is required');
	}
	return { version: 1, kind: body.kind as GrantKind, forestId: body.forestId };
}
