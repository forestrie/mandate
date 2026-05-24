import type { Hex } from 'viem';
import type { SigningBackend } from './signing-backend.js';
import { SigningBackendUnavailableError } from './signing-backend.js';
import { getConnectedEthereumProvider } from '$lib/privy/client.js';

/** v1 EOA signing via Privy-connected wallet (secp256k1_sign). */
export class PrivyEoaBackend implements SigningBackend {
	readonly kind = 'eoa' as const;

	isAvailable(): boolean {
		return typeof window !== 'undefined';
	}

	async signKs256Hash(hash: Hex): Promise<Hex> {
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
		return signature as Hex;
	}
}
