import { buildKs256ControlPlaneMessage } from '@mandate/coordinator-types';
import type { WalletChallengeEnvelope } from '@mandate/coordinator-types';
import { privateKeyToAccount } from 'viem/accounts';
import { recoverMessageAddress } from 'viem';
import { describe, expect, it } from 'vitest';

const TEST_PRIVATE_KEY =
	'0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const;

const sampleEnvelope: WalletChallengeEnvelope = {
	version: 'wcc-1',
	domain: 'localhost',
	coordinatorOrigin: 'http://localhost',
	authLogId: '0123456789abcdef0123456789abcdef',
	scopes: ['delegations:read'],
	nonce: 'test-nonce-abc',
	issuedAt: 1_700_000_000_000,
	expiresAt: 1_700_000_600_000
};

/**
 * Privy embedded wallets use EIP-1193 personal_sign, which is EIP-191 over the
 * UTF-8 message bytes. viem account.signMessage matches that wire format.
 */
describe('control-plane personal_sign recovery', () => {
	it('recovers the signer address from an EIP-191 signature', async () => {
		const account = privateKeyToAccount(TEST_PRIVATE_KEY);
		const message = buildKs256ControlPlaneMessage(sampleEnvelope);
		const signature = await account.signMessage({ message });

		const recovered = await recoverMessageAddress({
			message,
			signature
		});
		expect(recovered.toLowerCase()).toBe(account.address.toLowerCase());
	});
});
