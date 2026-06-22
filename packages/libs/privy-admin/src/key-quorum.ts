/** Privy key quorum member (authorization key or nested quorum). */
export interface KeyQuorumMember {
	type?: string;
	key_quorum_id?: string;
	authorization_key_id?: string;
}

/** Privy key quorum from GET /v1/key_quorums/{id}. */
export interface KeyQuorum {
	id: string;
	authorization_threshold?: number;
	members?: KeyQuorumMember[];
}
