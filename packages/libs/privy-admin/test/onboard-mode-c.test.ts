import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { onboardModeCWallet, PrivyRestClient, PrivyRestError } from '../src/index.js';
import type { Wallet } from '../src/index.js';

const MANDATE_SIGNER = 'kq_mandate_signer_0000000001';
const USER_OWNER_QUORUM = 'kq_user_owner_00000000000001';
const WALLET_ID = 'wallet_onboard_test';

function testOwnerAuthorizationKey(): string {
	const { privateKey } = generateKeyPairSync('ec', {
		namedCurve: 'P-256',
		privateKeyEncoding: { type: 'pkcs8', format: 'der' },
		publicKeyEncoding: { type: 'spki', format: 'der' }
	});
	return `wallet-auth:${Buffer.from(privateKey).toString('base64')}`;
}

function userOwnedWallet(): Wallet {
	return {
		id: WALLET_ID,
		address: '0x1234567890123456789012345678901234567890',
		chain_type: 'ethereum',
		owner_id: USER_OWNER_QUORUM,
		additional_signers: []
	};
}

function mockFetch(handlers: {
	wallet?: Wallet;
	quorumStatus?: number;
	patchCalled?: { value: boolean };
}): typeof fetch {
	return async (input, init) => {
		const url = String(input);
		const method = init?.method ?? 'GET';

		if (method === 'GET' && url.includes(`/v1/wallets/${WALLET_ID}`)) {
			return new Response(JSON.stringify(handlers.wallet ?? userOwnedWallet()), { status: 200 });
		}
		if (method === 'GET' && url.includes(`/v1/key_quorums/${USER_OWNER_QUORUM}`)) {
			const status = handlers.quorumStatus ?? 200;
			if (status === 404) {
				return new Response('not found', { status: 404 });
			}
			if (status >= 400) {
				return new Response('quorum lookup failed', { status });
			}
			return new Response(
				JSON.stringify({
					id: USER_OWNER_QUORUM,
					authorization_threshold: 1,
					members: [{ authorization_key_id: 'key_user_only' }]
				}),
				{ status: 200 }
			);
		}
		if (method === 'PATCH' && url.includes(`/v1/wallets/${WALLET_ID}`)) {
			if (handlers.patchCalled) handlers.patchCalled.value = true;
			const body = JSON.parse(String(init?.body)) as Wallet;
			return new Response(
				JSON.stringify({
					...userOwnedWallet(),
					additional_signers: body.additional_signers
				}),
				{ status: 200 }
			);
		}
		if (method === 'POST' && url.includes('/v1/policies')) {
			return new Response(JSON.stringify({ id: 'pol_test' }), { status: 200 });
		}
		return new Response(`unexpected ${method} ${url}`, { status: 500 });
	};
}

describe('onboardModeCWallet', () => {
	const ownerAuthorizationKey = testOwnerAuthorizationKey();

	it('aborts onboarding when getKeyQuorum fails with non-404 (fail closed)', async () => {
		const patchCalled = { value: false };
		const client = new PrivyRestClient({
			appId: 'app_test',
			appSecret: 'secret_test',
			fetchImpl: mockFetch({ quorumStatus: 503, patchCalled })
		});

		await expect(
			onboardModeCWallet(client, {
				walletId: WALLET_ID,
				mandateSignerId: MANDATE_SIGNER,
				keyRef: 'test-key',
				logId: 'c3d4e5f67890abcdef1234567890abcdef',
				signerUrl: 'https://signer.example/v1/sign',
				ownerAuthorizationKey
			})
		).rejects.toBeInstanceOf(PrivyRestError);

		expect(patchCalled.value).toBe(false);
	});

	it('proceeds when getKeyQuorum returns 404 (owner_id is user, not quorum)', async () => {
		const patchCalled = { value: false };
		const client = new PrivyRestClient({
			appId: 'app_test',
			appSecret: 'secret_test',
			fetchImpl: mockFetch({ quorumStatus: 404, patchCalled })
		});

		const output = await onboardModeCWallet(client, {
			walletId: WALLET_ID,
			mandateSignerId: MANDATE_SIGNER,
			keyRef: 'test-key',
			logId: 'c3d4e5f67890abcdef1234567890abcdef',
			signerUrl: 'https://signer.example/v1/sign',
			ownerAuthorizationKey,
			policyId: 'pol_existing'
		});

		expect(patchCalled.value).toBe(true);
		expect(output.policyId).toBe('pol_existing');
	});
});
