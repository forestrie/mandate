/**
 * Server-side clients for the operator-personality BFF (FOR-493).
 *
 * Enumeration: canopy `GET /api/payments/chain-bindings` (FOR-478) — ops
 * bearer, CBOR-only wire; `decodeCborDeterministic` yields Maps, converted
 * to plain objects here so the BFF can hand the browser JSON. Kill-switch:
 * canopy's admin JSON variant `GET /api/payments/admin/registrations/{R}/enabled`
 * — no CBOR involved. Both run only in the BFF: the canopy ops token never
 * reaches the browser.
 */

import { decodeCborDeterministic } from '@forestrie/encoding';
import type { OperatorBffConfig } from './ops-ui-gate.js';

export interface OperatorReceivablesRead {
	creditsBalance: number;
	checkpointsAccrued: number;
	arrears: string;
	enforcementFrozen: boolean;
	registrationBlock?: number | null;
	watermarkBlock: number | null;
}

export interface OperatorInstanceRow {
	univocityInstanceId: string;
	state: string;
	holder: string;
	reservedAt: number;
	r?: string;
	registrationBlock?: number | null;
	/**
	 * Present on registered rows. `enforcementFrozen` inside is the
	 * INDEXER-HELD freeze marker, not the effective enforcement state — a
	 * manual ops freeze reads `false` here (canopy plan-2607-08 design note);
	 * combine with the kill-switch read before rendering any "frozen" state.
	 */
	receivables?: OperatorReceivablesRead | null;
	receivablesDetail?: string;
}

export interface OperatorInstancePage {
	instances: OperatorInstanceRow[];
	cursor?: string;
}

export type OperatorClientResult<T> =
	| { ok: true; value: T }
	| { ok: false; status: number; detail: string };

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export async function fetchInstancePage(
	cfg: OperatorBffConfig,
	opts: { cursor?: string; limit?: string },
	fetchImpl: FetchLike = fetch
): Promise<OperatorClientResult<OperatorInstancePage>> {
	const url = new URL(`${cfg.canopyUpstreamUrl}/api/payments/chain-bindings`);
	if (opts.cursor !== undefined) url.searchParams.set('cursor', opts.cursor);
	if (opts.limit !== undefined) url.searchParams.set('limit', opts.limit);

	let res: Response;
	try {
		res = await fetchImpl(url.toString(), {
			headers: { Authorization: `Bearer ${cfg.canopyOpsAdminToken}` }
		});
	} catch (err) {
		return { ok: false, status: 502, detail: upstreamFailure(err) };
	}
	if (!res.ok) {
		// 400 (bad cursor/limit) passes through as the caller's fault; anything
		// else is an upstream failure the operator should see as such.
		const detail = await safeText(res);
		return { ok: false, status: res.status === 400 ? 400 : 502, detail };
	}

	let body: unknown;
	try {
		body = cborToPlain(decodeCborDeterministic(new Uint8Array(await res.arrayBuffer())));
	} catch {
		return { ok: false, status: 502, detail: 'enumeration response was not valid CBOR' };
	}
	const page = body as { instances?: unknown; cursor?: unknown };
	if (!Array.isArray(page.instances)) {
		return { ok: false, status: 502, detail: 'enumeration response missing instances' };
	}
	return {
		ok: true,
		value: {
			instances: page.instances as OperatorInstanceRow[],
			...(typeof page.cursor === 'string' ? { cursor: page.cursor } : {})
		}
	};
}

export async function fetchKillSwitchEnabled(
	cfg: OperatorBffConfig,
	rUuid: string,
	fetchImpl: FetchLike = fetch
): Promise<OperatorClientResult<{ R: string; enabled: boolean }>> {
	const url = `${cfg.canopyUpstreamUrl}/api/payments/admin/registrations/${encodeURIComponent(rUuid)}/enabled`;
	let res: Response;
	try {
		res = await fetchImpl(url, {
			headers: { Authorization: `Bearer ${cfg.canopyOpsAdminToken}` }
		});
	} catch (err) {
		return { ok: false, status: 502, detail: upstreamFailure(err) };
	}
	if (!res.ok) {
		const detail = await safeText(res);
		const passthrough = res.status === 400 || res.status === 404;
		return { ok: false, status: passthrough ? res.status : 502, detail };
	}
	let body: { R?: unknown; enabled?: unknown };
	try {
		body = (await res.json()) as typeof body;
	} catch {
		return { ok: false, status: 502, detail: 'kill-switch response was not valid JSON' };
	}
	if (typeof body.enabled !== 'boolean') {
		return { ok: false, status: 502, detail: 'kill-switch response missing enabled' };
	}
	return {
		ok: true,
		value: { R: typeof body.R === 'string' ? body.R : rUuid, enabled: body.enabled }
	};
}

/** Deterministic-CBOR maps → plain JSON-able objects, recursively. */
export function cborToPlain(value: unknown): unknown {
	if (value instanceof Map) {
		const out: Record<string, unknown> = {};
		for (const [k, v] of value.entries()) out[String(k)] = cborToPlain(v);
		return out;
	}
	if (Array.isArray(value)) return value.map(cborToPlain);
	return value;
}

async function safeText(res: Response): Promise<string> {
	const text = await res.text().catch(() => '');
	return (text || `upstream ${res.status}`).slice(0, 500);
}

function upstreamFailure(err: unknown): string {
	return `canopy request failed: ${err instanceof Error ? err.message : String(err)}`;
}
