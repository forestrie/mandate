/** Inputs for forest genesis v2 CBOR body (POST /api/forest/{R}/genesis). */
import type { UnivocityGenesisVariant } from './univocity-genesis-variant.js';

export interface GenesisCborInput {
	genesisAlg: number;
	bootstrapKey: Uint8Array;
	univocityAddr: Uint8Array;
	chainId: string;
	univocityVariant?: UnivocityGenesisVariant;
	univocityDeployer?: Uint8Array;
	/** 32-byte padded wire log id (-68010) for uups-counterfactual binding. */
	bootstrapLogId?: Uint8Array;
}
