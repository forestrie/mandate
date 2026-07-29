import { keccak256 } from 'viem';
import type { SigningBackend } from './signing-backend.js';
import { SigningBackendUnavailableError } from './signing-backend.js';
import { normalizeKs256Signature } from './ks256-sig-utils.js';
import { getConnectedEthereumProvider } from '$lib/privy/client.js';

/** v1 EOA signing via Privy-connected wallet (secp256k1_sign). */
export class PrivyEoaBackend implements SigningBackend {
	readonly kind = 'eoa' as const;

	isAvailable(): boolean {
		return typeof window !== 'undefined';
	}

	async signKs256SigStructure(sigStructureBytes: Uint8Array): Promise<Uint8Array> {
		const hash = keccak256(sigStructureBytes);
		const provider = await getConnectedEthereumProvider();
		if (!provider) {
			throw new SigningBackendUnavailableError('Connect a wallet before signing.');
		}

		const signature = (await provider.request({
			method: 'secp256k1_sign',
			params: [hash]
		})) as string;

		if (!signature?.startsWith('0x')) {
			throw new Error('Wallet returned an invalid signature');
		}
		// Privy returns v as 27/28; verifiers expect low-S with v in {0,1}.
		return normalizeKs256Signature(signature);
	}
}
