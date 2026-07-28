import { decode as decodeCbor } from 'cbor-x';
import { describe, expect, it } from 'vitest';
import { COSE_ALG_ES256, COSE_ALG_KS256 } from '../src/cose-alg.js';
import { buildGenesisCborBody } from '../src/genesis-request.js';
import {
	FOREST_GENESIS_LABEL_BOOTSTRAP_KEY,
	FOREST_GENESIS_LABEL_BOOTSTRAP_LOG_ID,
	FOREST_GENESIS_LABEL_CHAIN_ID,
	FOREST_GENESIS_LABEL_GENESIS_ALG,
	FOREST_GENESIS_LABEL_GENESIS_VERSION,
	FOREST_GENESIS_LABEL_UNIVOCITY_ADDR,
	FOREST_GENESIS_LABEL_UNIVOCITY_DEPLOYER,
	FOREST_GENESIS_LABEL_UNIVOCITY_VARIANT,
	FOREST_GENESIS_SCHEMA_V2,
	FOREST_GENESIS_UNIVOCITY_VARIANT_UUPS_COUNTERFACTUAL
} from '../src/forest-genesis-labels.js';
import { logIdPaddedWire32 } from '../src/log-id.js';

function intKeyMap(body: Uint8Array): Map<number, unknown> {
	const decoded = decodeCbor(body);
	if (decoded instanceof Map) return decoded;
	if (typeof decoded === 'object' && decoded !== null) {
		return new Map(
			Object.entries(decoded as Record<string, unknown>).map(([k, v]) => [Number(k), v])
		);
	}
	throw new Error('expected CBOR map');
}

describe('buildGenesisCborBody', () => {
	it('encodes KS256 genesis v2 with integer map keys', () => {
		const bootstrapKey = new Uint8Array(20).fill(0xab);
		const univocityAddr = new Uint8Array(20).fill(0xcd);
		const body = buildGenesisCborBody({
			genesisAlg: COSE_ALG_KS256,
			bootstrapKey,
			univocityAddr,
			chainId: '84532'
		});
		const map = intKeyMap(body);
		expect(map.get(FOREST_GENESIS_LABEL_GENESIS_VERSION)).toBe(FOREST_GENESIS_SCHEMA_V2);
		expect(map.get(FOREST_GENESIS_LABEL_GENESIS_ALG)).toBe(COSE_ALG_KS256);
		expect(new Uint8Array(map.get(FOREST_GENESIS_LABEL_BOOTSTRAP_KEY) as Uint8Array)).toEqual(
			bootstrapKey
		);
		expect(new Uint8Array(map.get(FOREST_GENESIS_LABEL_UNIVOCITY_ADDR) as Uint8Array)).toEqual(
			univocityAddr
		);
		expect(map.get(FOREST_GENESIS_LABEL_CHAIN_ID)).toBe('84532');
	});

	it('encodes ES256 genesis with 64-byte bootstrapKey', () => {
		const bootstrapKey = new Uint8Array(64).fill(0x01);
		const body = buildGenesisCborBody({
			genesisAlg: COSE_ALG_ES256,
			bootstrapKey,
			univocityAddr: new Uint8Array(20),
			chainId: '1'
		});
		const map = intKeyMap(body);
		expect(map.get(FOREST_GENESIS_LABEL_GENESIS_ALG)).toBe(COSE_ALG_ES256);
		expect((map.get(FOREST_GENESIS_LABEL_BOOTSTRAP_KEY) as Uint8Array).length).toBe(64);
	});

	it('rejects invalid KS256 bootstrapKey length', () => {
		expect(() =>
			buildGenesisCborBody({
				genesisAlg: COSE_ALG_KS256,
				bootstrapKey: new Uint8Array(19),
				univocityAddr: new Uint8Array(20),
				chainId: '84532'
			})
		).toThrow(/20 bytes/);
	});

	it('encodes uups-counterfactual genesis labels (-68016/-68017/-68010)', () => {
		const logIdHex32 = 'a1b2c3d4e5f67890abcdef1234567890';
		const bootstrapKey = new Uint8Array(20).fill(0xab);
		const univocityAddr = new Uint8Array(20).fill(0xcd);
		const deployer = new Uint8Array(20).fill(0xef);
		const body = buildGenesisCborBody({
			genesisAlg: COSE_ALG_KS256,
			bootstrapKey,
			univocityAddr,
			chainId: '84532',
			univocityVariant: 'uups-counterfactual',
			univocityDeployer: deployer,
			bootstrapLogId: logIdPaddedWire32(logIdHex32)
		});
		const map = intKeyMap(body);
		expect(map.get(FOREST_GENESIS_LABEL_UNIVOCITY_VARIANT)).toBe(
			FOREST_GENESIS_UNIVOCITY_VARIANT_UUPS_COUNTERFACTUAL
		);
		expect(new Uint8Array(map.get(FOREST_GENESIS_LABEL_UNIVOCITY_DEPLOYER) as Uint8Array)).toEqual(
			deployer
		);
		expect(new Uint8Array(map.get(FOREST_GENESIS_LABEL_BOOTSTRAP_LOG_ID) as Uint8Array)).toEqual(
			logIdPaddedWire32(logIdHex32)
		);
	});
});
