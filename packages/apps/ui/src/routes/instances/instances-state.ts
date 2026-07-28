/**
 * Pure display/persistence logic for the operator instances surface
 * (FOR-493), split from the page for unit testing — the fees/delegations
 * console pattern.
 */

import type { OperatorInstanceRow } from '$lib/operator/instances-client.js';

/**
 * sessionStorage, deliberately not localStorage: the ops UI token is a
 * credential, and the fees page's localStorage precedent holds only a
 * public instance id.
 */
const OPS_TOKEN_STORAGE_KEY = 'mandate.operator.opsUiToken';

export const DEFAULT_PAGE_LIMIT = 50;

export function loadStoredOpsToken(): string {
	if (typeof sessionStorage === 'undefined') return '';
	return sessionStorage.getItem(OPS_TOKEN_STORAGE_KEY) ?? '';
}

export function saveStoredOpsToken(token: string): void {
	if (typeof sessionStorage === 'undefined') return;
	const trimmed = token.trim();
	if (trimmed) {
		sessionStorage.setItem(OPS_TOKEN_STORAGE_KEY, trimmed);
	} else {
		sessionStorage.removeItem(OPS_TOKEN_STORAGE_KEY);
	}
}

export interface EnforcementPosture {
	label: string;
	variant: 'default' | 'secondary' | 'outline';
	alarming: boolean;
}

/**
 * The manual-vs-arrears freeze discriminator (canopy plan-2607-08 design
 * note). `marker` is the enumeration's `enforcementFrozen` — the
 * INDEXER-HELD marker, which a manual ops freeze deliberately leaves
 * `false`; `enabled` is the kill-switch read, the effective state. Until
 * `enabled` is loaded the effective state is unknown and must be rendered
 * as such — never render the marker alone as "frozen"/"active".
 */
export function enforcementPosture(
	marker: boolean | undefined,
	enabled: boolean | undefined
): EnforcementPosture {
	if (enabled === undefined) {
		return marker === true
			? { label: 'Arrears marker set — load kill-switch', variant: 'outline', alarming: true }
			: { label: 'Kill-switch not loaded', variant: 'secondary', alarming: false };
	}
	if (enabled) {
		return { label: 'Sealing enabled', variant: 'default', alarming: false };
	}
	return marker === true
		? { label: 'Frozen (arrears)', variant: 'outline', alarming: true }
		: { label: 'Frozen (manual ops)', variant: 'outline', alarming: true };
}

/** Arrears posture enum pill — mirrors the fees page's tolerance. */
export function arrearsLabel(arrears: string | undefined): string {
	switch (arrears) {
		case undefined:
		case 'current':
			return '';
		case 'suspect':
			return 'arrears suspect';
		case 'in-arrears':
			return 'in arrears';
		default:
			return `arrears: ${arrears}`;
	}
}

/**
 * Append a fetched page, replacing any row already listed for the same
 * instance — a reload after the kill-switch changed must not duplicate.
 */
export function mergePage(
	existing: OperatorInstanceRow[],
	page: OperatorInstanceRow[]
): OperatorInstanceRow[] {
	const incoming = new Set(page.map((row) => row.univocityInstanceId));
	return [...existing.filter((row) => !incoming.has(row.univocityInstanceId)), ...page];
}

/** `registrationBlock`: null = observation failed (repair pending); absent = legacy. */
export function registrationBlockText(row: OperatorInstanceRow): string {
	if (row.registrationBlock === null) return 'pending repair';
	if (row.registrationBlock === undefined) return '—';
	return String(row.registrationBlock);
}

export function reservedAtText(row: OperatorInstanceRow): string {
	if (!Number.isFinite(row.reservedAt) || row.reservedAt <= 0) return '—';
	return new Date(row.reservedAt * 1000).toISOString().replace('T', ' ').slice(0, 16) + 'Z';
}
