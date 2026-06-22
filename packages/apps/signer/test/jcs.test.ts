import { describe, expect, it } from 'vitest';
import { canonicalizeJson } from '../src/privy/jcs.js';

describe('canonicalizeJson (RFC 8785 JCS)', () => {
	it('sorts object keys by UTF-16 code unit order', () => {
		expect(canonicalizeJson({ z: 1, a: 2, m: 3 })).toBe('{"a":2,"m":3,"z":1}');
	});

	it('serializes version as a JSON number without quotes', () => {
		expect(canonicalizeJson({ version: 1 })).toBe('{"version":1}');
	});

	it('escapes string control characters', () => {
		expect(canonicalizeJson({ text: 'a"b\\c' })).toBe('{"text":"a\\"b\\\\c"}');
	});

	it('escapes U+0000 through U+001f control characters', () => {
		expect(canonicalizeJson({ c: '\u0000\u0001\u001f' })).toBe('{"c":"\\u0000\\u0001\\u001f"}');
	});

	it('serializes negative zero as 0', () => {
		expect(canonicalizeJson({ n: -0 })).toBe('{"n":0}');
	});

	it('sorts UTF-16 surrogate pair keys by code unit order', () => {
		expect(canonicalizeJson({ '\u{1F600}': 1, a: 2 })).toBe('{"a":2,"\uD83D\uDE00":1}');
	});

	it('canonicalizes nested arrays', () => {
		expect(canonicalizeJson({ items: [3, 1, 2] })).toBe('{"items":[3,1,2]}');
	});

	it('canonicalizes nested objects and arrays in Privy payload shape', () => {
		const payload = {
			version: 1,
			method: 'POST',
			url: 'https://api.privy.io/v1/wallets/wallet-1/rpc',
			body: {
				chain_type: 'ethereum',
				method: 'secp256k1_sign',
				params: { hash: '0xabc' }
			},
			headers: { 'privy-app-id': 'app-123' }
		};
		const out = canonicalizeJson(payload);
		expect(out).toBe(
			'{"body":{"chain_type":"ethereum","method":"secp256k1_sign","params":{"hash":"0xabc"}},' +
				'"headers":{"privy-app-id":"app-123"},' +
				'"method":"POST",' +
				'"url":"https://api.privy.io/v1/wallets/wallet-1/rpc",' +
				'"version":1}'
		);
	});
});
