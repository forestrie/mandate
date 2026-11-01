/** CBOR body for POST /api/delegations (arbor delegationcert). */
export interface DelegationIssueRequest {
	version?: number;
	domain?: string;
	chainId?: string;
	contractAddress?: string;
	logId: Uint8Array;
	/**
	 * CBOR major type 0 as decoded: `number` when safe, `bigint` above 2^53
	 * (FOR-613).
	 */
	mmrStart: number | bigint;
	mmrEnd: number | bigint;
	algorithm: string;
	delegatedPublicKey: Uint8Array;
	requestedTtlSeconds?: number;
	requestId?: Uint8Array;
}
