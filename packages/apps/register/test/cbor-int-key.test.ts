import { describe, expect, it } from 'vitest';
import { cborIntKeyBytes } from '../src/cbor-int-key.js';

describe('cborIntKeyBytes (canopy strict-decoder compatibility)', () => {
	it('emits plain maps and plain bstrs — no cbor-x tags', () => {
		const bytes = cborIntKeyBytes(
			new Map<number, unknown>([
				[1, 'x'],
				[7, new Uint8Array([1, 2, 3])]
			])
		);
		// map(2){1: "x", 7: h'010203'} — exact canonical framing. A tagged
		// encoding (d9 0103 map / d8 40 bstr) reads back as an opaque CborTag
		// in canopy's decoder and 400s the request.
		expect(Buffer.from(bytes).toString('hex')).toBe('a20161780743010203');
	});

	it('encodes negative private claim keys per major type 1', () => {
		const bytes = cborIntKeyBytes(new Map<number, unknown>([[-70000, 'v']]));
		// -70000 → 0x3a 0x00 0x01 0x11 0x6f
		expect(Buffer.from(bytes).toString('hex')).toBe('a13a0001116f6176');
	});
});
