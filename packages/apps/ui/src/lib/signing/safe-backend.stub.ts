import type { Hex } from 'viem';
import type { SigningBackend } from './signing-backend.js';
import { SigningNotImplementedError } from './signing-backend.js';

/**
 * Future: Safe / ERC-1271 multisig signing via Safe SDK + curator features.
 * Privy can connect Safe wallets but cannot assemble threshold signatures alone.
 */
export class SafeBackend implements SigningBackend {
	readonly kind = 'safe' as const;

	isAvailable(): boolean {
		return false;
	}

	async signKs256SigStructure(_sigStructureBytes: Uint8Array): Promise<Hex> {
		void _sigStructureBytes;
		throw new SigningNotImplementedError(
			'Safe / ERC-1271 signing is not implemented. See univocity plan-0029 and docs/adr-0001-auth-strategy-seams.md.'
		);
	}
}
