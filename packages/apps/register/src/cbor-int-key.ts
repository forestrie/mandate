/**
 * CBOR encoder for integer-key maps (forest genesis v2 contract).
 * Avoid bare cbor-x `encode()` which can emit string-key maps.
 *
 * Maps are emitted in RFC 8949 §4.2.1 deterministic key order (shorter
 * encoded key first, then bytewise) at every level. canopy decodes request
 * bodies with a decoder that enforces that order, so a map written in
 * insertion order — the genesis body puts the 5-byte `genesis-version` key
 * before the 1-byte labels — is rejected as an invalid body.
 */
import { Encoder } from 'cbor-x';

const cborEncoder = new Encoder({ mapsAsObjects: false });

function encodedKey(key: unknown): Uint8Array {
	const out = cborEncoder.encode(key);
	return out instanceof Uint8Array ? out : new Uint8Array(out as ArrayLike<number>);
}

/** Canonical order: by encoded length, then bytewise. */
export function compareCanonicalKeys(a: Uint8Array, b: Uint8Array): number {
	if (a.length !== b.length) return a.length - b.length;
	for (let i = 0; i < a.length; i++) {
		if (a[i] !== b[i]) return (a[i] as number) - (b[i] as number);
	}
	return 0;
}

/** Return `value` with every Map (at any depth) re-ordered canonically. */
export function canonicalizeMaps(value: unknown): unknown {
	if (value instanceof Map) {
		const entries = [...value.entries()].map(([k, v]) => ({
			k,
			v: canonicalizeMaps(v),
			enc: encodedKey(k)
		}));
		entries.sort((x, y) => compareCanonicalKeys(x.enc, y.enc));
		return new Map(entries.map((e) => [e.k, e.v]));
	}
	if (Array.isArray(value)) return value.map(canonicalizeMaps);
	return value;
}

export function cborIntKeyBytes(value: unknown): Uint8Array {
	const encoded = cborEncoder.encode(canonicalizeMaps(value));
	return encoded instanceof Uint8Array ? encoded : new Uint8Array(encoded as ArrayLike<number>);
}
