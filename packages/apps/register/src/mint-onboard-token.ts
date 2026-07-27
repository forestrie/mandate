import { univocityInstanceIdFromChainBinding } from './univocity-instance-id.js';

/**
 * Break-glass onboard-token mint via the canopy ops API (ADR-0059 decision
 * 8, catch-up FOR-482). Bindings are MANDATORY: every token is scoped to one
 * univocity instance (CBOR int keys 3 `chainId`, 4 `univocityAddr`), and the
 * mint RESERVES that instance — on a conflict canopy returns 409 and revokes
 * the just-minted token itself, so there is nothing to clean up client-side;
 * the reservation is released via the ops chain-bindings route.
 */
export interface MintOnboardTokenResult {
	token: string;
	/** Token hash — the ops revoke/inspect handle. */
	ref?: string;
	/** Canonical CAIP-10 id of the instance this token is scoped (and now reserved) to. */
	univocityInstanceId: string;
}

export class MintOnboardTokenConflictError extends Error {
	constructor(
		readonly univocityInstanceId: string,
		detail: string
	) {
		super(
			`univocity instance ${univocityInstanceId} is already reserved or registered ` +
				`(canopy revoked the just-minted token; release via the ops chain-bindings route): ${detail}`
		);
		this.name = 'MintOnboardTokenConflictError';
	}
}

export async function mintOnboardToken(opts: {
	canopyBaseUrl: string;
	opsAdminToken: string;
	/** Bare decimal chain id, e.g. "84532". */
	chainId: string;
	/** Univocity contract address, 40 hex chars, optional 0x prefix. */
	univocityAddr: string;
	label?: string;
	fetchImpl?: typeof fetch;
}): Promise<MintOnboardTokenResult> {
	const { encode } = await import('cbor-x');
	const fetchImpl = opts.fetchImpl ?? fetch;
	const base = opts.canopyBaseUrl.trim().replace(/\/$/, '');
	const addr40 = opts.univocityAddr.trim().replace(/^0x/i, '').toLowerCase();
	// Fail fast with the canonical-form error rather than a canopy 400.
	const univocityInstanceId = univocityInstanceIdFromChainBinding({
		chainId: opts.chainId,
		univocityAddr: addr40
	});

	const response = await fetchImpl(`${base}/api/payments/onboard-tokens`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${opts.opsAdminToken}`,
			'Content-Type': 'application/cbor',
			Accept: 'application/cbor'
		},
		body: encode(
			new Map<number, unknown>([
				[1, opts.label ?? 'mandate-provision-e2e'],
				[3, opts.chainId.trim()],
				[4, addr40]
			])
		) as unknown as BodyInit
	});
	if (response.status === 409) {
		const detail = await response.text().catch(() => '');
		throw new MintOnboardTokenConflictError(univocityInstanceId, detail.slice(0, 300));
	}
	if (response.status !== 201) {
		const detail = await response.text().catch(() => '');
		throw new Error(
			`mint onboard token: expected 201, got ${response.status}: ${detail.slice(0, 300)}`
		);
	}
	const { decode } = await import('cbor-x');
	const body = decode(new Uint8Array(await response.arrayBuffer())) as {
		token?: string;
		ref?: string;
		univocityInstanceId?: string;
	};
	const token = body.token?.trim();
	if (!token) {
		throw new Error('mint onboard token: response missing token field');
	}
	return {
		token,
		ref: body.ref,
		// Trust our derivation; canopy echoes the same canonical value.
		univocityInstanceId: body.univocityInstanceId ?? univocityInstanceId
	};
}
