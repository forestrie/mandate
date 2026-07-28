/**
 * Canopy wire CBOR — the ONLY encode/decode chokepoint for canopy-bound
 * bodies and canopy responses.
 *
 * Uses `@forestrie/encoding` (the platform's COSE-correct codec, shared
 * with canopy and forestrie-cli). cbor-x is BANNED in this repo (eslint
 * `no-restricted-imports` + AGENTS.md): it is designed for JavaScript
 * round-tripping and makes CBOR/COSE-incompatible choices — record
 * extensions for objects, tag 259 for Maps, tag 64 for Uint8Array — which
 * canopy's strict deterministic decoder surfaces as opaque tags, 400ing
 * request bodies and silently dropping byte-string fields. That class of
 * bug has bitten repeatedly; don't reintroduce it.
 */

import { decodeCborDeterministic, encodeCborDeterministic } from '@forestrie/encoding';

/** Encode a canopy request body (int-keyed Map, values incl. nested maps/bstr). */
export function cborIntKeyBytes(value: unknown): Uint8Array {
	return encodeCborDeterministic(value);
}

function mapsToObjects(value: unknown): unknown {
	if (value instanceof Map) {
		const out: Record<string, unknown> = {};
		for (const [k, v] of value) out[String(k)] = mapsToObjects(v);
		return out;
	}
	if (Array.isArray(value)) return value.map(mapsToObjects);
	return value;
}

/**
 * Decode a canopy CBOR response into a plain record (canopy responses are
 * string-keyed maps; nested maps convert deeply, byte strings stay
 * `Uint8Array`). Strict: tags, floats, or trailing bytes throw.
 */
export function decodeCborRecord(bytes: Uint8Array): Record<string, unknown> {
	const decoded = mapsToObjects(decodeCborDeterministic(bytes));
	if (typeof decoded !== 'object' || decoded === null || Array.isArray(decoded)) {
		throw new Error('expected a CBOR map response');
	}
	return decoded as Record<string, unknown>;
}
