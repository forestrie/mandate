/** RPC method mandate Mode C additional signers may use for delegation sealing. */
export const DELEGATION_SIGN_METHOD = 'secp256k1_sign' as const;

/**
 * Privy policy methods explicitly denied for Mode C mandate additional signers.
 * Privy is default-deny; these DENY rules block high-risk methods if present.
 */
export const DENIED_MODE_C_POLICY_METHODS = [
	'exportPrivateKey',
	'exportSeedPhrase',
	'eth_sendTransaction',
	'eth_signTransaction',
	'eth_signUserOperation',
	'eth_signTypedData_v4',
	'personal_sign',
	'eth_sign7702Authorization',
	'wallet_sendCalls',
	'signTransaction',
	'signAndSendTransaction',
	'transfer',
	'earn_deposit',
	'earn_withdraw',
	'signTransactionBytes'
] as const;

export type DeniedModeCPolicyMethod = (typeof DENIED_MODE_C_POLICY_METHODS)[number];
