import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { OwnerTopologyError, revokeModeCWallet, PrivyRestClient } from '../src/index.js';
import type { Wallet } from '../src/index.js';

const MANDATE_SIGNER = 'kq_mandate_signer_0000000001';
const USER_OWNER_QUORUM = 'kq_user_owner_00000000000001';
const TEST_PRIVY_API_BASE = 'https://privy.test';
const WALLET_ID = 'wallet_revoke_test';

function testOwnerAuthorizationKey(): string {
	const { privateKey } = generateKeyPairSync('ec', {
		namedCurve: 'P-256',
		privateKeyEncoding: { type: 'pkcs8', format: 'der' },
		publicKeyEncoding: { type: 'spki', format: 'der' }
	});
	return `wallet-auth:${Buffer.from(privateKey).toString('base64')}`;
}

function userOwnedWallet(overrides: Partial<Wallet> = {}): Wallet {
	return {
		id: WALLET_ID,
		address: '0x1234567890123456789012345678901234567890',
		chain_type: 'ethereum',
		owner_id: USER_OWNER_QUORUM,
		additional_signers: [{ signer_id: MANDATE_SIGNER, override_policy_ids: ['pol_1'] }],
		...overrides
	};
}

describe('revokeModeCWallet', () => {
	const ownerAuthorizationKey = testOwnerAuthorizationKey();

	it('PATCHes additional_signers:[] with owner authorization signature', async () => {
		let patchBody: unknown;
		let authSigPresent = false;
		let getCount = 0;

		const fetchImpl: typeof fetch = async (input, init) => {
			const url = String(input);
			const method = init?.method ?? 'GET';

			if (method === 'GET' && url.includes(`/v1/wallets/${WALLET_ID}`)) {
				getCount += 1;
				if (getCount === 1) {
					return new Response(JSON.stringify(userOwnedWallet()), { status: 200 });
				}
				return new Response(JSON.stringify(userOwnedWallet({ additional_signers: [] })), {
					status: 200
				});
			}

			if (method === 'PATCH' && url.includes(`/v1/wallets/${WALLET_ID}`)) {
				patchBody = JSON.parse(String(init?.body));
				const headers = init?.headers as Record<string, string> | undefined;
				authSigPresent = Boolean(headers?.['privy-authorization-signature']);
				return new Response(JSON.stringify(userOwnedWallet({ additional_signers: [] })), {
					status: 200
				});
			}

			return new Response(`unexpected ${method} ${url}`, { status: 500 });
		};

		const client = new PrivyRestClient({
			appId: 'app_test',
			appSecret: 'secret_test',
			apiBase: TEST_PRIVY_API_BASE,
			fetchImpl
		});

		const output = await revokeModeCWallet(client, {
			walletId: WALLET_ID,
			ownerAuthorizationKey,
			mandateSignerId: MANDATE_SIGNER
		});

		expect(patchBody).toEqual({ additional_signers: [] });
		expect(authSigPresent).toBe(true);
		expect(output.walletId).toBe(WALLET_ID);
		expect(output.additionalSignersAfter).toEqual([]);
		expect(output.revoked).toBe(true);
		expect(output.hadMandateSigner).toBe(true);
	});

	it('throws when mandate signer was not listed before revoke', async () => {
		let patchCalled = false;
		const fetchImpl: typeof fetch = async (input, init) => {
			const url = String(input);
			const method = init?.method ?? 'GET';

			if (method === 'GET' && url.includes(`/v1/wallets/${WALLET_ID}`)) {
				return new Response(JSON.stringify(userOwnedWallet({ additional_signers: [] })), {
					status: 200
				});
			}

			if (method === 'PATCH' && url.includes(`/v1/wallets/${WALLET_ID}`)) {
				patchCalled = true;
				return new Response(JSON.stringify(userOwnedWallet()), { status: 200 });
			}

			return new Response(`unexpected ${method} ${url}`, { status: 500 });
		};

		const client = new PrivyRestClient({
			appId: 'app_test',
			appSecret: 'secret_test',
			apiBase: TEST_PRIVY_API_BASE,
			fetchImpl
		});

		await expect(
			revokeModeCWallet(client, {
				walletId: WALLET_ID,
				ownerAuthorizationKey,
				mandateSignerId: MANDATE_SIGNER
			})
		).rejects.toBeInstanceOf(OwnerTopologyError);
		expect(patchCalled).toBe(false);
	});

	it('throws when wallet is ownerless before PATCH', async () => {
		const fetchImpl: typeof fetch = async (input, init) => {
			const url = String(input);
			const method = init?.method ?? 'GET';

			if (method === 'GET' && url.includes(`/v1/wallets/${WALLET_ID}`)) {
				return new Response(
					JSON.stringify(userOwnedWallet({ owner_id: null, owner: null, additional_signers: [] })),
					{ status: 200 }
				);
			}

			return new Response(`unexpected ${method} ${url}`, { status: 500 });
		};

		const client = new PrivyRestClient({
			appId: 'app_test',
			appSecret: 'secret_test',
			apiBase: TEST_PRIVY_API_BASE,
			fetchImpl
		});

		await expect(
			revokeModeCWallet(client, {
				walletId: WALLET_ID,
				ownerAuthorizationKey
			})
		).rejects.toBeInstanceOf(OwnerTopologyError);
	});

	it('propagates PrivyRestError when PATCH returns 403', async () => {
		const { PrivyRestError } = await import('../src/privy-rest-error.js');

		const fetchImpl: typeof fetch = async (input, init) => {
			const url = String(input);
			const method = init?.method ?? 'GET';

			if (method === 'GET' && url.includes(`/v1/wallets/${WALLET_ID}`)) {
				return new Response(JSON.stringify(userOwnedWallet()), { status: 200 });
			}

			if (method === 'PATCH' && url.includes(`/v1/wallets/${WALLET_ID}`)) {
				return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 });
			}

			return new Response(`unexpected ${method} ${url}`, { status: 500 });
		};

		const client = new PrivyRestClient({
			appId: 'app_test',
			appSecret: 'secret_test',
			apiBase: TEST_PRIVY_API_BASE,
			fetchImpl
		});

		await expect(
			revokeModeCWallet(client, {
				walletId: WALLET_ID,
				ownerAuthorizationKey,
				mandateSignerId: MANDATE_SIGNER
			})
		).rejects.toBeInstanceOf(PrivyRestError);
	});
});
