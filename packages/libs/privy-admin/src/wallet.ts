import type { WalletAdditionalSignerItem } from './wallet-additional-signer.js';

/** Privy wallet owner reference (user id or key quorum). */
export interface WalletOwner {
	user_id?: string;
	public_key?: string;
}

/** Privy wallet object from GET/UPDATE APIs. */
export interface Wallet {
	id: string;
	address: string;
	chain_type: string;
	owner_id?: string | null;
	owner?: WalletOwner | null;
	additional_signers?: WalletAdditionalSignerItem[];
}
