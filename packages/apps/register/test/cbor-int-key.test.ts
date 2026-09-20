import { describe, expect, it } from 'vitest';
import { cborIntKeyBytes, compareCanonicalKeys } from '../src/cbor-int-key.js';
import { buildGenesisCborBody } from '../src/genesis-request.js';
import { COSE_ALG_ES256 } from '../src/cose-alg.js';

const hex = (u8: Uint8Array) => Buffer.from(u8).toString('hex');

describe('cborIntKeyBytes', () => {
	it('emits map keys in deterministic order: shorter encoding first, then bytewise', () => {
		// insertion order puts the 5-byte negative key first; the encoding must not
		const map = new Map<number, unknown>([
			[-68009, 2],
			[24, 0],
			[-1, 0],
			[1, 0]
		]);
		// keys: 1 -> 01 (1 byte), -1 -> 20 (1 byte), 24 -> 1818 (2 bytes), -68009 -> 3a000109a8 (5 bytes)
		expect(hex(cborIntKeyBytes(map))).toBe('a4' + '0100' + '2000' + '181800' + '3a000109a802');
	});

	it('orders nested maps too', () => {
		const inner = new Map<number, unknown>([
			[300, 1],
			[2, 1]
		]);
		const outer = new Map<number, unknown>([[5, inner]]);
		expect(hex(cborIntKeyBytes(outer))).toBe('a1' + '05' + 'a2' + '0201' + '19012c01');
	});

	it('compares keys by length before bytes', () => {
		expect(compareCanonicalKeys(new Uint8Array([0x20]), new Uint8Array([0x18, 0x18]))).toBeLessThan(0);
		expect(compareCanonicalKeys(new Uint8Array([0x02]), new Uint8Array([0x01]))).toBeGreaterThan(0);
	});

	it('genesis body orders the five-byte labels bytewise, not in insertion order', () => {
		const body = buildGenesisCborBody({
			genesisAlg: COSE_ALG_ES256,
			bootstrapKey: new Uint8Array(64),
			univocityAddr: new Uint8Array(20),
			chainId: 84532
		} as never);
		// insertion order is version, alg, key, addr, chain; canonical order is
		// -68009 (…09a8), -68011 (…09aa), -68013 (…09ac), -68014 (…09ad), -68015 (…09ae)
		const expected =
			'a5' +
			'3a000109a8' + '02' +
			'3a000109aa' + '54' + '00'.repeat(20) +
			'3a000109ac' + '1a00014a34' +
			'3a000109ad' + '26' +
			'3a000109ae' + '5840' + '00'.repeat(64);
		expect(hex(body)).toBe(expected);
	});
});
