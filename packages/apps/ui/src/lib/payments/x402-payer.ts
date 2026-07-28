/**
 * Browser x402 `exact` payer (FOR-485): sign an EIP-3009
 * `TransferWithAuthorization` against a decoded `X-PAYMENT-REQUIRED`
 * challenge and render the base64 `X-PAYMENT` header value canopy's
 * `parsePaymentHeader` expects. Mirrors forestrie-cli's
 * `src/lib/x402-payment.ts` payload shape exactly; the signature comes from
 * the wallet via `eth_signTypedData_v4` instead of a local key.
 *
 * REAL money moves when a signed payment settles (testnet USDC on dev).
 */

import type { EthereumProvider } from '$lib/privy/client.js';

interface X402Option {
	scheme: string;
	network: string;
	payTo: string;
	asset: string;
	amount: string;
	maxTimeoutSeconds?: number;
	extra?: { name?: string; version?: string };
}

function b64ToUtf8(b64: string): string {
	const bin = atob(b64);
	const bytes = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
	return new TextDecoder().decode(bytes);
}

function utf8ToB64(text: string): string {
	const bytes = new TextEncoder().encode(text);
	let bin = '';
	for (const b of bytes) bin += String.fromCharCode(b);
	return btoa(bin);
}

function randomNonceHex(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(32));
	return `0x${Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('')}`;
}

/** Pick the `exact` option out of a decoded challenge, or explain why not. */
export function parseExactChallengeOption(paymentRequiredB64: string): X402Option {
	const decoded = JSON.parse(b64ToUtf8(paymentRequiredB64)) as { accepts?: X402Option[] };
	const chosen = (decoded.accepts ?? []).find((o) => o.scheme === 'exact');
	if (!chosen) {
		throw new Error("X-PAYMENT-REQUIRED has no 'exact' scheme option");
	}
	if (!chosen.extra?.name || !chosen.extra?.version) {
		throw new Error('challenge lacks EIP-712 domain name/version in extra');
	}
	return chosen;
}

/**
 * What the caller QUOTED to the user — the challenge must match before
 * anything is signed (plan-2607-02 R1). The displayed price and the signed
 * value must be one number, and the payment must be on the chain this
 * console is configured for.
 */
export interface X402PaymentExpectation {
	/** The atomic amount shown to the user (the 402 body's `amountAtomic`). */
	amountAtomic: string;
	/** The configured chain id; the challenge's `network` must name it. */
	chainId: number;
}

/**
 * Sign the challenge with the connected wallet and return the base64
 * `X-PAYMENT` header value. `payerAddress` must be the wallet the provider
 * signs for — it becomes the transfer's `from`. Refuses to sign when the
 * challenge disagrees with `expectation`.
 */
export async function signX402PaymentTypedData(
	paymentRequiredB64: string,
	provider: EthereumProvider,
	payerAddress: string,
	expectation: X402PaymentExpectation,
	nowSec: number = Math.floor(Date.now() / 1000)
): Promise<string> {
	const chosen = parseExactChallengeOption(paymentRequiredB64);
	if (chosen.amount !== expectation.amountAtomic) {
		throw new Error(
			`challenge amount ${chosen.amount} does not match the quoted ${expectation.amountAtomic} — refusing to sign`
		);
	}
	const challengeChainId = Number(chosen.network.split(':')[1]);
	if (challengeChainId !== expectation.chainId) {
		throw new Error(
			`challenge names chain ${chosen.network}, expected eip155:${expectation.chainId} — refusing to sign`
		);
	}
	const nonce = randomNonceHex();
	const validAfter = (nowSec - 600).toString();
	const validBefore = (nowSec + (chosen.maxTimeoutSeconds ?? 300)).toString();

	// EIP-712 payload in the JSON form eth_signTypedData_v4 takes: uint256
	// values as decimal strings, domain from the challenge (`verifyingContract`
	// is the asset — USDC's own domain, not ours).
	const typedData = {
		domain: {
			name: chosen.extra!.name!,
			version: chosen.extra!.version!,
			chainId: challengeChainId,
			verifyingContract: chosen.asset
		},
		types: {
			EIP712Domain: [
				{ name: 'name', type: 'string' },
				{ name: 'version', type: 'string' },
				{ name: 'chainId', type: 'uint256' },
				{ name: 'verifyingContract', type: 'address' }
			],
			TransferWithAuthorization: [
				{ name: 'from', type: 'address' },
				{ name: 'to', type: 'address' },
				{ name: 'value', type: 'uint256' },
				{ name: 'validAfter', type: 'uint256' },
				{ name: 'validBefore', type: 'uint256' },
				{ name: 'nonce', type: 'bytes32' }
			]
		},
		primaryType: 'TransferWithAuthorization',
		message: {
			from: payerAddress,
			to: chosen.payTo,
			value: chosen.amount,
			validAfter,
			validBefore,
			nonce
		}
	};

	const signature = (await provider.request({
		method: 'eth_signTypedData_v4',
		params: [payerAddress, JSON.stringify(typedData)]
	})) as string;
	if (!signature?.startsWith('0x')) {
		throw new Error('Wallet returned an invalid typed-data signature');
	}

	const payload = {
		x402Version: 2,
		payload: {
			authorization: {
				from: payerAddress,
				to: chosen.payTo,
				value: chosen.amount,
				validAfter,
				validBefore,
				nonce
			},
			signature
		},
		resource: {
			url: '',
			description: 'mandate credits purchase',
			mimeType: 'application/json'
		},
		accepted: {
			scheme: 'exact',
			network: chosen.network,
			asset: chosen.asset,
			amount: chosen.amount,
			payTo: chosen.payTo,
			maxTimeoutSeconds: chosen.maxTimeoutSeconds ?? 300,
			extra: chosen.extra
		}
	};
	return utf8ToB64(JSON.stringify(payload));
}
