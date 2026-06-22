/** Inputs for forest genesis v2 CBOR body (POST /api/forest/{R}/genesis). */
export interface GenesisCborInput {
	genesisAlg: number;
	bootstrapKey: Uint8Array;
	univocityAddr: Uint8Array;
	chainId: string;
}
