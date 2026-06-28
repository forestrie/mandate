import { describe, expect, test, vi } from 'vitest';
import { ensureWalletChain } from './wallet-chain.js';

describe('ensureWalletChain', () => {
	test('switches wallet when chain differs', async () => {
		let chainHex = '0x1';
		const provider = {
			request: vi.fn(async ({ method, params }: { method: string; params?: unknown[] }) => {
				if (method === 'eth_chainId') {
					return chainHex;
				}
				if (method === 'wallet_switchEthereumChain') {
					chainHex = (params?.[0] as { chainId: string }).chainId;
					return null;
				}
				return null;
			})
		};

		await ensureWalletChain(provider, 84532);
		expect(chainHex).toBe('0x14a34');
	});
});
