/**
 * Canonical decimal-string codec for the delegation MMR range on the
 * coordinator's JSON routes (canopy plan-2611-01 D1, FOR-613).
 *
 * JSON numbers lose precision above 2^53, so every `mmrStart` / `mmrEnd`
 * bound travels as a decimal string matching `^(0|[1-9][0-9]*)$` with
 * value ≤ 2^64-1. Mirrors canopy's
 * [`decimal-uint64.ts`](https://github.com/forestrie/canopy/blob/main/packages/apps/delegation-coordinator/src/decimal-uint64.ts)
 * exactly: a JSON number, a leading zero, a sign or whitespace is malformed
 * (hard cutover, no dual parsing). Parse at the edge, work in `bigint`,
 * format when building a request body.
 */

/** 2^64-1, the largest MMR index a delegation certificate can carry. */
export const UINT64_MAX = (1n << 64n) - 1n;

/** Canonical unsigned decimal: no sign, no leading zero, no whitespace. */
const CANONICAL_DECIMAL = /^(0|[1-9][0-9]*)$/;

/** Longest canonical decimal of a uint64 (2^64-1 has 20 digits). */
const MAX_UINT64_DIGITS = 20;

/** Thrown when a JSON value is not a canonical decimal uint64 string. */
export class DecimalUint64Error extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'DecimalUint64Error';
	}
}

/**
 * Parse a decoded JSON value as a canonical decimal uint64 string.
 *
 * @param value - Only a string is accepted; a JSON number is malformed.
 * @param what - Field name for error messages (e.g. "mmrStart").
 * @returns The value as `bigint` in `[0, 2^64-1]`.
 */
export function parseDecimalUint64(value: unknown, what: string): bigint {
	if (typeof value !== 'string') {
		throw new DecimalUint64Error(
			`${what} must be a decimal string (got ${value === null ? 'null' : typeof value})`
		);
	}
	if (value.length > MAX_UINT64_DIGITS || !CANONICAL_DECIMAL.test(value)) {
		throw new DecimalUint64Error(`${what} must be a canonical decimal uint64 string`);
	}
	const parsed = BigInt(value);
	if (parsed > UINT64_MAX) {
		throw new DecimalUint64Error(`${what} exceeds 2^64-1`);
	}
	return parsed;
}

/**
 * Format a uint64 as its canonical decimal string for a JSON body.
 *
 * @param value - A `bigint` in `[0, 2^64-1]`.
 */
export function formatDecimalUint64(value: bigint): string {
	if (value < 0n || value > UINT64_MAX) {
		throw new DecimalUint64Error(`value ${value} is not a uint64`);
	}
	return value.toString(10);
}
