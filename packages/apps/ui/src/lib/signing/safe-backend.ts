import { keccak256, type Hex } from 'viem';
import type { EthereumProvider } from '$lib/privy/client.js';
import type { SigningBackend } from './signing-backend.js';
import { SigningBackendUnavailableError } from './signing-backend.js';
import { KS256_SIG_BYTES } from './ks256-sig-utils.js';

/**
 * Safe 1x1 (Mode D) signing backend (plan-2607-45 slice 03, FOR-502): the
 * KS256 root is a 1-of-1 Safe contract account and the connected injected
 * wallet is its sole owner. `keccak256(Sig_structure)` is wrapped in the
 * Safe's EIP-712 `SafeMessage` envelope and signed with
 * `eth_signTypedData_v4` — MetaMask-native, no raw-hash signing anywhere.
 *
 * The verifiers hand the returned blob to the Safe's
 * `isValidSignature(hash, blob)`, which recomputes the SafeMessage digest
 * internally and ecrecovers the owner. For a 1-of-1 typed-data signature the
 * blob is the owner's 65-byte `r‖s‖v` AS-IS with v ∈ {27,28}: no `v += 4`
 * eth_sign adjustment (that flavour is for EIP-191-prefixed owner sigs), and
 * none of the KS256 EOA normalisation (v → 0/1 would flip the Safe into its
 * contract-signature / approved-hash branches).
 */

export interface SafeSigningContext {
	provider: EthereumProvider;
	/** Connected injected wallet — the Safe's sole owner; signs the SafeMessage. */
	ownerAddress: string;
	/** The 1-of-1 Safe contract account — the KS256 root. */
	safeAddress: string;
	/** Chain the Safe is deployed on; part of the EIP-712 domain. */
	chainId: number;
}

export type SafeSigningContextResolver = () => Promise<SafeSigningContext>;

/**
 * The EIP-712 payload `eth_signTypedData_v4` takes for a SafeMessage, as the
 * JSON string wallets expect. Domain and types mirror Safe >= 1.3.0:
 * `{chainId, verifyingContract}` (no name/version/salt) and
 * `SafeMessage { bytes message }` where `message` is the 32-byte KS256 digest
 * (the Safe's fallback handler wraps `abi.encode(hash)`).
 */
export function buildSafeMessageTypedDataJson(
	hash: Hex,
	chainId: number,
	safeAddress: string
): string {
	return JSON.stringify({
		domain: { chainId, verifyingContract: safeAddress },
		types: {
			EIP712Domain: [
				{ name: 'chainId', type: 'uint256' },
				{ name: 'verifyingContract', type: 'address' }
			],
			SafeMessage: [{ name: 'message', type: 'bytes' }]
		},
		primaryType: 'SafeMessage',
		message: { message: hash }
	});
}

/**
 * Parse the wallet's typed-data signature into the Safe owner blob. Kept
 * byte-for-byte except v: a wallet that reports the recovery id as 0/1 is
 * lifted to the 27/28 flavour Safe's `checkSignatures` demands for EIP-712
 * owner signatures; anything else out of range is refused loudly.
 */
export function safeOwnerSignatureBytes(signatureHex: string): Uint8Array {
	const stripped = signatureHex.trim().replace(/^0x/i, '');
	if (stripped.length !== KS256_SIG_BYTES * 2 || !/^[0-9a-fA-F]+$/.test(stripped)) {
		throw new Error(`Safe owner signature must be ${KS256_SIG_BYTES} bytes of hex`);
	}
	const out = new Uint8Array(KS256_SIG_BYTES);
	for (let i = 0; i < KS256_SIG_BYTES; i++) {
		out[i] = parseInt(stripped.slice(i * 2, i * 2 + 2), 16);
	}
	if (out[64] === 0 || out[64] === 1) out[64] = out[64]! + 27;
	if (out[64] !== 27 && out[64] !== 28) {
		throw new Error(`Safe owner signature v must be 27 or 28, got ${out[64]}`);
	}
	return out;
}

async function resolveContextFromInjectedSession(): Promise<SafeSigningContext> {
	// Dynamic so node unit tests with an injected resolver never touch the
	// browser-only wallets store.
	const { getSafeSigningContext } = await import('$lib/wallets/stores.svelte.js');
	return getSafeSigningContext();
}

/**
 * Sign an arbitrary 32-byte digest as a SafeMessage with the owner wallet
 * and return the 27/28-flavoured owner blob. Shared by the KS256 COSE path
 * (keccak256(Sig_structure)) and the wcc-1 control-plane challenge (EIP-191
 * digest, coordinator FOR-505) — both end at the root Safe's
 * `isValidSignature(digest, blob)`.
 */
export async function signSafeMessageForDigest(
	context: SafeSigningContext,
	digest: Hex
): Promise<Uint8Array> {
	const typedDataJson = buildSafeMessageTypedDataJson(digest, context.chainId, context.safeAddress);
	const signature = (await context.provider.request({
		method: 'eth_signTypedData_v4',
		params: [context.ownerAddress, typedDataJson]
	})) as string;
	if (typeof signature !== 'string' || !signature.startsWith('0x')) {
		throw new SigningBackendUnavailableError('Wallet returned an invalid SafeMessage signature');
	}
	return safeOwnerSignatureBytes(signature);
}

export class SafeBackend implements SigningBackend {
	readonly kind = 'safe' as const;

	constructor(
		private readonly resolveContext: SafeSigningContextResolver = resolveContextFromInjectedSession
	) {}

	isAvailable(): boolean {
		return typeof window !== 'undefined';
	}

	async signKs256SigStructure(sigStructureBytes: Uint8Array): Promise<Uint8Array> {
		const context = await this.resolveContext();
		return signSafeMessageForDigest(context, keccak256(sigStructureBytes));
	}
}
