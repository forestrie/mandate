import type { Wallet } from './wallet.js';
import type { WalletAdditionalSignerItem } from './wallet-additional-signer.js';
import type { KeyQuorum } from './key-quorum.js';
import type { PrivyRestClient } from './privy-rest.js';
import { PrivyRestError } from './privy-rest-error.js';
import { OwnerTopologyError } from './owner-topology-error.js';
import { assertWalletIsUserOwned } from './owner-topology.js';

export interface WalletUpdateBody {
	display_name?: string | null;
	policy_ids?: string[];
	owner?: { user_id?: string; public_key?: string } | null;
	owner_id?: string | null;
	additional_signers?: WalletAdditionalSignerItem[];
}

export async function getWallet(client: PrivyRestClient, walletId: string): Promise<Wallet> {
	const response = await client.request({
		method: 'GET',
		path: `/v1/wallets/${walletId}`
	});
	return (await response.json()) as Wallet;
}

export async function updateWallet(
	client: PrivyRestClient,
	walletId: string,
	body: WalletUpdateBody,
	ownerAuthorizationKey: string
): Promise<Wallet> {
	const response = await client.request({
		method: 'PATCH',
		path: `/v1/wallets/${walletId}`,
		body: body as unknown as Record<string, unknown>,
		authorizationKey: ownerAuthorizationKey
	});
	return (await response.json()) as Wallet;
}

export async function getKeyQuorum(client: PrivyRestClient, quorumId: string): Promise<KeyQuorum> {
	const response = await client.request({
		method: 'GET',
		path: `/v1/key_quorums/${quorumId}`
	});
	return (await response.json()) as KeyQuorum;
}

export interface WalletRpcInput {
	walletId: string;
	method: string;
	params: Record<string, unknown>;
	authorizationKey?: string;
}

/** POST /v1/wallets/{id}/rpc — returns raw Response for policy accept/deny tests. */
export async function walletRpc(client: PrivyRestClient, input: WalletRpcInput): Promise<Response> {
	const body = {
		chain_type: 'ethereum',
		method: input.method,
		params: input.params
	};
	return client.request({
		method: 'POST',
		path: `/v1/wallets/${input.walletId}/rpc`,
		body,
		authorizationKey: input.authorizationKey
	});
}

/** Like {@link walletRpc} but returns status/body without throwing on HTTP errors. */
export async function walletRpcAttempt(
	client: PrivyRestClient,
	input: WalletRpcInput
): Promise<{ ok: boolean; status: number; body: string }> {
	try {
		const response = await walletRpc(client, input);
		return { ok: true, status: response.status, body: await response.text() };
	} catch (error) {
		if (error instanceof PrivyRestError) {
			return { ok: false, status: error.status, body: error.body ?? error.message };
		}
		throw error;
	}
}

export async function removeAllAdditionalSigners(
	client: PrivyRestClient,
	walletId: string,
	ownerAuthorizationKey: string
): Promise<Wallet> {
	return updateWallet(client, walletId, { additional_signers: [] }, ownerAuthorizationKey);
}

/** Additional signers with the given signer id filtered out (pure). */
export function withoutSigner(
	signers: WalletAdditionalSignerItem[] | undefined,
	signerId: string
): WalletAdditionalSignerItem[] {
	return (signers ?? []).filter((s) => s.signer_id !== signerId);
}

/**
 * Remove only mandate's additional-signer entry, preserving every other signer
 * (targeted custody kill switch — ARC-0022 I3). Fails closed when mandate is
 * not currently listed, so callers never silently no-op a revoke.
 */
export async function removeMandateAdditionalSigner(
	client: PrivyRestClient,
	walletId: string,
	mandateSignerId: string,
	ownerAuthorizationKey: string,
	/** When the caller already fetched the wallet (avoids a redundant GET). */
	walletSnapshot?: Wallet
): Promise<Wallet> {
	const wallet = walletSnapshot ?? (await getWallet(client, walletId));
	assertWalletIsUserOwned(wallet);
	const current = wallet.additional_signers ?? [];
	const next = withoutSigner(current, mandateSignerId);
	if (next.length === current.length) {
		throw new OwnerTopologyError(
			`mandate signer ${mandateSignerId} is not registered as an additional signer — nothing to revoke`
		);
	}
	return updateWallet(client, walletId, { additional_signers: next }, ownerAuthorizationKey);
}

export function mergeAdditionalSigner(
	existing: WalletAdditionalSignerItem[] | undefined,
	entry: WalletAdditionalSignerItem
): WalletAdditionalSignerItem[] {
	const signers = [...(existing ?? [])];
	const index = signers.findIndex((s) => s.signer_id === entry.signer_id);
	if (index >= 0) {
		signers[index] = entry;
	} else {
		signers.push(entry);
	}
	return signers;
}
