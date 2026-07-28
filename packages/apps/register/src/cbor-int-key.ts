/**
 * CBOR encoder for canopy request bodies (integer-key maps, plain framing).
 *
 * canopy decodes with a STRICT deterministic decoder that surfaces any tag
 * as an opaque `CborTag` — cbor-x's defaults (tag 259 for Maps, tag 64 for
 * Uint8Array) therefore read back as the wrong types and the request 400s
 * ("Invalid CBOR body") or silently drops byte-string fields (FOR-484
 * catch-up finding; the genesis body's tag-64 bootstrapKey was part of why
 * mandate was functionally broken against lane A). This encoder emits plain
 * maps (major type 5) and plain bstrs (major type 2) only — use it for
 * EVERY canopy-bound body; never bare cbor-x `encode()`.
 */

import { Encoder } from 'cbor-x';

// mapsAsObjects:false also suppresses the tag-259 Map wrapping cbor-x's
// bare encode() emits; tagUint8Array:false yields plain bstrs.
const cborEncoder = new Encoder({
	mapsAsObjects: false,
	tagUint8Array: false
});

export function cborIntKeyBytes(value: unknown): Uint8Array {
	const encoded = cborEncoder.encode(value);
	return encoded instanceof Uint8Array ? encoded : new Uint8Array(encoded as ArrayLike<number>);
}
