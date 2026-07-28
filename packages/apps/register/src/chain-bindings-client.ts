/**
 * Ops client for canopy's chain-binding reservation records (ADR-0059
 * decision 8, plan-2607-02 R4; mandate catch-up FOR-483). The record at
 * `/api/payments/chain-bindings/{univocityInstanceId}` is the two-state
 * uniqueness claim — `reserved` at admission (paid request or ops mint),
 * `registered` at genesis — and DELETE is the recovery path for abandoned
 * reservations: a paid reservation never expires on its own.
 */

import { decodeCborRecord } from './canopy-cbor.js';

export interface ChainBindingRecord {
	state: 'reserved' | 'registered';
	/** `request:{id}`, `token:{hash}`, or `genesis`. */
	holder: string;
	reservedAt: number;
	/** Forest root UUID; present once `registered`. */
	r?: string;
	/** Metering floor recorded at registration (canopy plan-2607-04); null = observation failed. */
	registrationBlock?: number | null;
}

function normalizeBase(base: string): string {
	return base.trim().replace(/\/$/, '');
}

interface ChainBindingRequest {
	canopyBaseUrl: string;
	opsAdminToken: string;
	univocityInstanceId: string;
	fetchImpl?: typeof fetch;
}

async function chainBindingFetch(
	opts: ChainBindingRequest,
	method: 'GET' | 'DELETE'
): Promise<ChainBindingRecord | null> {
	const fetchImpl = opts.fetchImpl ?? fetch;
	const url = `${normalizeBase(opts.canopyBaseUrl)}/api/payments/chain-bindings/${encodeURIComponent(
		opts.univocityInstanceId
	)}`;
	const response = await fetchImpl(url, {
		method,
		headers: {
			Authorization: `Bearer ${opts.opsAdminToken}`,
			Accept: 'application/cbor'
		}
	});
	if (response.status === 404) return null;
	if (!response.ok) {
		const detail = await response.text().catch(() => '');
		throw new Error(`chain-binding ${method} failed: ${response.status}: ${detail.slice(0, 300)}`);
	}
	return decodeCborRecord(
		new Uint8Array(await response.arrayBuffer())
	) as unknown as ChainBindingRecord;
}

/** Inspect a reservation record; null when no claim exists. */
export async function getChainBinding(
	opts: ChainBindingRequest
): Promise<ChainBindingRecord | null> {
	return chainBindingFetch(opts, 'GET');
}

/**
 * Release a reservation (ops recovery): dangling `reserved` claims from a
 * conflicted or abandoned mint. Returns what was released, null when
 * nothing was held. Releasing a `registered` record orphans a live
 * account — inspect first.
 */
export async function releaseChainBinding(
	opts: ChainBindingRequest
): Promise<ChainBindingRecord | null> {
	return chainBindingFetch(opts, 'DELETE');
}
