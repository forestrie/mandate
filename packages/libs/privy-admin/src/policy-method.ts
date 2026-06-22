/** Wallet RPC method mandate-signer uses for delegation sealing (Privy API). */
export const DELEGATION_SIGN_RPC_METHOD = 'secp256k1_sign' as const;

/**
 * Privy override-policy ALLOW method. `secp256k1_sign` is not a valid policy
 * method; Privy maps raw hash signing to `raw_sign` / `*` in policies.
 */
export const DELEGATION_POLICY_ALLOW_METHOD = '*' as const;

/** EVM chain ids covered by ethereum_transaction DENY rules. */
export const ETHEREUM_POLICY_DENY_CHAIN_IDS = [
	'1',
	'10',
	'56',
	'137',
	'8453',
	'84532',
	'42161',
	'11155111'
] as const;

/**
 * Privy policy methods explicitly denied for Mode C mandate additional signers.
 * DENY rules override the delegation ALLOW `*` rule for matching RPC methods.
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
