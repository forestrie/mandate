/**
 * Pure display/persistence logic for the fee-account surface (FOR-485),
 * split from the page for unit testing — the delegations console pattern.
 */

import type { FeeAccountRead } from '$lib/payments/canopy-client.js';

/** Purchase bounds mirror canopy's credits route (1..100000). */
export const MIN_CREDITS_PER_PURCHASE = 1;
export const MAX_CREDITS_PER_PURCHASE = 100_000;
export const DEFAULT_CREDITS_PER_PURCHASE = 100;

const INSTANCE_STORAGE_KEY = 'mandate.fees.univocityInstanceId';

export function loadStoredInstanceId(): string {
	if (typeof localStorage === 'undefined') return '';
	return localStorage.getItem(INSTANCE_STORAGE_KEY) ?? '';
}

export function saveStoredInstanceId(univocityInstanceId: string): void {
	if (typeof localStorage === 'undefined') return;
	const trimmed = univocityInstanceId.trim();
	if (trimmed) {
		localStorage.setItem(INSTANCE_STORAGE_KEY, trimmed);
	} else {
		localStorage.removeItem(INSTANCE_STORAGE_KEY);
	}
}

/** Enforcement posture pill: frozen is the alarming state. */
export function enforcementBadge(read: FeeAccountRead): {
	label: string;
	variant: 'default' | 'secondary' | 'outline';
	alarming: boolean;
} {
	return read.enforcementFrozen
		? { label: 'Sealing frozen', variant: 'outline', alarming: true }
		: { label: 'Sealing active', variant: 'default', alarming: false };
}

/**
 * Arrears is the receivables ledger's COARSE posture enum, not an amount:
 * `current | suspect | in-arrears` (x402-settlement ReceivablesDO §7 —
 * deliberately imprecise; ops reconciliation is the backstop). Tolerant of
 * unknown future states: anything unrecognised is surfaced, not hidden.
 */
export function arrearsBadge(
	read: FeeAccountRead
): { label: string; variant: 'default' | 'secondary' | 'outline'; alarming: boolean } | null {
	switch (read.arrears) {
		case 'current':
			return null;
		case 'suspect':
			return { label: 'Arrears suspect', variant: 'outline', alarming: false };
		case 'in-arrears':
			return { label: 'In arrears', variant: 'outline', alarming: true };
		default:
			return { label: `Arrears: ${read.arrears}`, variant: 'outline', alarming: false };
	}
}

/**
 * Render the registration floor without collapsing the tri-state (canopy
 * plan-2607-07 R2): ABSENT = legacy record predating floor capture; explicit
 * `null` = the genesis-time observation failed and an ops repair is pending.
 */
export function registrationBlockLabel(read: FeeAccountRead): string {
	if (!('registrationBlock' in read)) {
		return 'Legacy record (no registration floor)';
	}
	if (read.registrationBlock === null) {
		return 'Not observed — ops repair pending';
	}
	return `Block ${read.registrationBlock}`;
}

/** USDC atomic units (6 decimals) → "$1.00" display. */
export function formatUsdcAtomic(atomic: string): string {
	if (!/^[0-9]+$/.test(atomic)) return atomic;
	const units = BigInt(atomic);
	const whole = units / 1_000_000n;
	const frac = (units % 1_000_000n).toString().padStart(6, '0').slice(0, 2);
	return `$${whole}.${frac}`;
}

/** Parse the credits form field; null when out of bounds or not an integer. */
export function parseCreditsInput(raw: string): number | null {
	const trimmed = raw.trim();
	if (!/^[0-9]+$/.test(trimmed)) return null;
	const n = Number.parseInt(trimmed, 10);
	if (!Number.isSafeInteger(n) || n < MIN_CREDITS_PER_PURCHASE || n > MAX_CREDITS_PER_PURCHASE) {
		return null;
	}
	return n;
}

/**
 * After a 202, poll the read until the balance moves past its pre-purchase
 * value. Settlement is on-chain, so bound the wait and let the user retry.
 */
export const SETTLEMENT_POLL_INTERVAL_MS = 10_000;
export const SETTLEMENT_POLL_LIMIT = 30;

export function creditsLanded(before: FeeAccountRead, after: FeeAccountRead): boolean {
	return (
		after.univocityInstanceId === before.univocityInstanceId &&
		after.creditsBalance > before.creditsBalance
	);
}
