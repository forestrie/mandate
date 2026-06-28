import { describe, expect, it } from 'vitest';
import {
	E2E_MOCK_SIGNATURE_HEX,
	E2E_MOCK_WALLET_ADDRESS,
	createMockPrivyClient,
	mockWalletAddressWhenAuthenticated,
	resetMockPrivyAuthState
} from './mock-client.js';

describe('createMockPrivyClient', () => {
	it('returns fixed wallet address after loginWithCode', async () => {
		resetMockPrivyAuthState();
		const client = await createMockPrivyClient();
		await client.auth.email.sendCode('e2e@example.com');
		await client.auth.email.loginWithCode('e2e@example.com', '000000', 'login-or-sign-up', {});
		const { user } = await client.user.get();
		expect(user).not.toBeNull();
		const provider = await client.embeddedWallet.getEthereumProvider({});
		const sig = await provider.request({ method: 'secp256k1_sign', params: ['0x00'] });
		expect(sig).toBe(E2E_MOCK_SIGNATURE_HEX);
		resetMockPrivyAuthState();
	});

	it('exposes the documented mock wallet constant', () => {
		expect(E2E_MOCK_WALLET_ADDRESS).toMatch(/^0xE2E/);
	});

	it('resetMockPrivyAuthState clears mock session', async () => {
		resetMockPrivyAuthState();
		const client = await createMockPrivyClient();
		await client.auth.email.loginWithCode('e2e@example.com', '000000', 'login-or-sign-up', {});
		expect(mockWalletAddressWhenAuthenticated()).not.toBeNull();
		resetMockPrivyAuthState();
		expect(mockWalletAddressWhenAuthenticated()).toBeNull();
	});
});
