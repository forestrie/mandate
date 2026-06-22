/**
 * CBOR encoder for integer-key maps (forest genesis v2 contract).
 * Avoid bare cbor-x `encode()` which can emit string-key maps.
 */

import { Encoder } from 'cbor-x';

const cborEncoder = new Encoder({ mapsAsObjects: false });

export function cborIntKeyBytes(value: unknown): Uint8Array {
	const encoded = cborEncoder.encode(value);
	return encoded instanceof Uint8Array ? encoded : new Uint8Array(encoded as ArrayLike<number>);
}
