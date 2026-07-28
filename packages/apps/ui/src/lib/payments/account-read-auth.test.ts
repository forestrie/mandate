import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockEnv: Record<string, string | undefined> = {};
vi.mock('$env/dynamic/public', () => ({ env: mockEnv }));

const signCalls: Uint8Array[] = [];
vi.mock('$lib/signing/resolve-backend.js', () => ({
	resolveSigningBackend: async () => ({
		kind: 'eoa',
		isAvailable: () => true,
		signKs256SigStructure: async (bytes: Uint8Array) => {
			signCalls.push(bytes);
			return `0x${'ab'.repeat(64)}00`;
		}
	})
}));

const INSTANCE = `eip155:84532:0x${'cd'.repeat(20)}`;

beforeEach(async () => {
	mockEnv.PUBLIC_CANOPY_API_URL = 'https://api-a.forest-2.forestrie.dev';
	signCalls.length = 0;
	const { clearAccountReadAuthorizations } = await import('./account-read-auth.js');
	clearAccountReadAuthorizations();
});

describe('mintAccountReadAuthorization', () => {
	it('mints a Forestrie-Account-Read header and reuses it within the window', async () => {
		const { mintAccountReadAuthorization } = await import('./account-read-auth.js');
		const now = 1785200000;
		const first = await mintAccountReadAuthorization(INSTANCE, now);
		expect(first).toMatch(/^Forestrie-Account-Read [A-Za-z0-9_-]+$/);
		expect(signCalls).toHaveLength(1);

		// Well inside the 90 s window: cached, no second signature.
		const again = await mintAccountReadAuthorization(INSTANCE, now + 30);
		expect(again).toBe(first);
		expect(signCalls).toHaveLength(1);

		// Inside the expiry margin: re-minted.
		const reminted = await mintAccountReadAuthorization(INSTANCE, now + 80);
		expect(reminted).not.toBe(first);
		expect(signCalls).toHaveLength(2);
	});

	it('rejects a non-canonical instance id before touching the signer', async () => {
		const { mintAccountReadAuthorization } = await import('./account-read-auth.js');
		await expect(mintAccountReadAuthorization('eip155:84532:0xABC')).rejects.toThrow(
			/not a canonical univocity instance id/
		);
		expect(signCalls).toHaveLength(0);
	});
});
