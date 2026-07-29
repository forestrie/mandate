import { env } from '$env/dynamic/public';
import type { EthereumProvider } from '$lib/privy/client.js';

/**
 * Bring-your-own-Safe validation (plan-2607-45 slice 03, decision Q3): before
 * a Safe address is accepted as the KS256 root the console proves, browser-
 * side, that it is a deployed 1-of-1 Safe owned by the connected wallet —
 * `eth_getCode` non-empty, `getOwners()` contains the owner, and
 * `getThreshold() == 1`.
 *
 * Reads go through `PUBLIC_RPC_URL` when configured (validation should not
 * have to trust the wallet's own RPC); otherwise they fall back to the
 * connected injected provider's `eth_call` — which is also what keeps the
 * hermetic Playwright suite RPC-free.
 */

/** `getOwners()` / `getThreshold()` — Safe interface selectors. */
const GET_OWNERS_SELECTOR = '0xa0e67e2b';
const GET_THRESHOLD_SELECTOR = '0xe75235b8';

export interface SafeReadTransport {
	/** `eth_call` against `to` with calldata `data`; returns the hex result. */
	call(to: string, data: string): Promise<string>;
	/** `eth_getCode` for `address`; returns the hex bytecode ('0x' when none). */
	getCode(address: string): Promise<string>;
}

export function isEthAddress(value: string): boolean {
	return /^0x[0-9a-fA-F]{40}$/.test(value.trim());
}

/** Browser-exposed RPC endpoint for Safe validation reads, when configured. */
export function publicRpcUrl(): string | null {
	const raw = env.PUBLIC_RPC_URL?.trim();
	return raw ? raw : null;
}

/** JSON-RPC transport over `PUBLIC_RPC_URL` (or any explicit endpoint). */
export function rpcTransport(url: string, fetchImpl: typeof fetch = fetch): SafeReadTransport {
	let requestId = 0;
	const rpc = async (method: string, params: unknown[]): Promise<string> => {
		const response = await fetchImpl(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ jsonrpc: '2.0', id: ++requestId, method, params })
		});
		if (!response.ok) {
			throw new Error(`RPC ${method} failed: HTTP ${response.status}`);
		}
		const body = (await response.json()) as { result?: unknown; error?: { message?: string } };
		if (body.error) {
			throw new Error(`RPC ${method} failed: ${body.error.message ?? 'unknown error'}`);
		}
		if (typeof body.result !== 'string') {
			throw new Error(`RPC ${method} returned a non-hex result`);
		}
		return body.result;
	};
	return {
		call: (to, data) => rpc('eth_call', [{ to, data }, 'latest']),
		getCode: (address) => rpc('eth_getCode', [address, 'latest'])
	};
}

/** Transport over the connected injected wallet's own RPC. */
export function providerTransport(provider: EthereumProvider): SafeReadTransport {
	const request = async (method: string, params: unknown[]): Promise<string> => {
		const result = await provider.request({ method, params });
		if (typeof result !== 'string') {
			throw new Error(`wallet ${method} returned a non-hex result`);
		}
		return result;
	};
	return {
		call: (to, data) => request('eth_call', [{ to, data }, 'latest']),
		getCode: (address) => request('eth_getCode', [address, 'latest'])
	};
}

/** `PUBLIC_RPC_URL` when set, else the injected provider's `eth_call`. */
export function defaultSafeReadTransport(provider: EthereumProvider): SafeReadTransport {
	const url = publicRpcUrl();
	return url ? rpcTransport(url) : providerTransport(provider);
}

/** Decode an ABI `address[]` return word-by-word (offset ‖ length ‖ words). */
function decodeAddressArray(result: string): string[] {
	const hex = result.replace(/^0x/, '');
	const word = (index: number) => hex.slice(index * 64, (index + 1) * 64);
	if (hex.length < 128) {
		throw new Error('getOwners returned malformed data');
	}
	const offsetWords = Number(BigInt(`0x${word(0)}`)) / 32;
	const length = Number(BigInt(`0x${word(offsetWords)}`));
	const owners: string[] = [];
	for (let i = 0; i < length; i++) {
		const w = word(offsetWords + 1 + i);
		if (w.length !== 64) throw new Error('getOwners returned malformed data');
		owners.push(`0x${w.slice(24)}`);
	}
	return owners;
}

export type SafeValidationResult =
	| { ok: true; owners: string[]; threshold: number }
	| { ok: false; reason: string };

/**
 * Validate `safeAddress` as a Mode D root for `ownerAddress`. Distinguishes a
 * failed check (returned `{ok: false}`) from an unreachable chain (thrown) —
 * "could not ask the contract" is not "the contract said no".
 */
export async function validateSafeAccount(
	transport: SafeReadTransport,
	safeAddress: string,
	ownerAddress: string
): Promise<SafeValidationResult> {
	if (!isEthAddress(safeAddress)) {
		return { ok: false, reason: 'Enter a 0x-prefixed 20-byte Safe address' };
	}
	const safe = safeAddress.trim();
	const code = await transport.getCode(safe);
	if (!code || code === '0x' || code === '0x0') {
		return {
			ok: false,
			reason: 'No contract code at this address — is the Safe deployed on this chain?'
		};
	}
	const owners = decodeAddressArray(await transport.call(safe, GET_OWNERS_SELECTOR)).map((o) =>
		o.toLowerCase()
	);
	const threshold = Number(BigInt(await transport.call(safe, GET_THRESHOLD_SELECTOR)));
	if (threshold !== 1) {
		return { ok: false, reason: `Safe threshold is ${threshold}; Mode D needs a 1-of-1 Safe` };
	}
	if (!owners.includes(ownerAddress.trim().toLowerCase())) {
		return { ok: false, reason: 'Connected wallet is not an owner of this Safe' };
	}
	return { ok: true, owners, threshold };
}
