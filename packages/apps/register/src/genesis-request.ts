import { COSE_ALG_ES256, COSE_ALG_KS256 } from './cose-alg.js';
import { cborIntKeyBytes } from './cbor-int-key.js';
import type { GenesisCborInput } from './genesis-cbor-input.js';
import {
	FOREST_GENESIS_LABEL_BOOTSTRAP_KEY,
	FOREST_GENESIS_LABEL_CHAIN_ID,
	FOREST_GENESIS_LABEL_GENESIS_ALG,
	FOREST_GENESIS_LABEL_GENESIS_VERSION,
	FOREST_GENESIS_LABEL_UNIVOCITY_ADDR,
	FOREST_GENESIS_SCHEMA_V2
} from './forest-genesis-labels.js';

function assertBootstrapKey(genesisAlg: number, bootstrapKey: Uint8Array): void {
	if (genesisAlg === COSE_ALG_KS256 && bootstrapKey.length !== 20) {
		throw new Error('KS256 bootstrapKey must be 20 bytes (Ethereum address)');
	}
	if (genesisAlg === COSE_ALG_ES256 && bootstrapKey.length !== 64) {
		throw new Error('ES256 bootstrapKey must be 64 bytes (x||y)');
	}
	if (genesisAlg !== COSE_ALG_KS256 && genesisAlg !== COSE_ALG_ES256) {
		throw new Error(`unsupported genesisAlg ${genesisAlg}`);
	}
}

/** Build CBOR v2 genesis POST body with integer map keys. */
export function buildGenesisCborBody(input: GenesisCborInput): Uint8Array {
	if (input.univocityAddr.length !== 20) {
		throw new Error('univocityAddr must be 20 bytes');
	}
	assertBootstrapKey(input.genesisAlg, input.bootstrapKey);

	const map = new Map<number, unknown>([
		[FOREST_GENESIS_LABEL_GENESIS_VERSION, FOREST_GENESIS_SCHEMA_V2],
		[FOREST_GENESIS_LABEL_GENESIS_ALG, input.genesisAlg],
		[FOREST_GENESIS_LABEL_BOOTSTRAP_KEY, input.bootstrapKey],
		[FOREST_GENESIS_LABEL_UNIVOCITY_ADDR, input.univocityAddr],
		[FOREST_GENESIS_LABEL_CHAIN_ID, input.chainId]
	]);
	return cborIntKeyBytes(map);
}
