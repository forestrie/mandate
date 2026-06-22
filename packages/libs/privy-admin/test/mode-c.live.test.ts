import { randomBytes } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import {
	assertMandateIsAdditionalSignerOnly,
	createDelegationSigningPolicy,
	getWallet,
	onboardModeCWallet,
	PrivyRestClient,
	walletRpcAttempt
} from '../src/index.js';

/**
 * Live Mode C onboarding validation (FOR-112 + FOR-116).
 *
 * Uses a dedicated wallet (`PRIVY_MODE_C_WALLET_ID`) so the existing
 * `PRIVY_WALLET_ID` live signer test wallet is not mutated.
 *
 * Required env (via Doppler mandate-forestrie/dev):
 * - PRIVY_APP_ID, PRIVY_APP_SECRET
 * - PRIVY_AUTHORIZATION_KEY (mandate additional-signer key)
 * - PRIVY_MANDATE_SIGNER_ID (key quorum id for mandate signer)
 * - PRIVY_MODE_C_WALLET_ID (user-owned wallet for onboarding tests)
 * - PRIVY_OWNER_AUTHORIZATION_KEY (owner key for wallet PATCH)
 */

const APP_ID = process.env.PRIVY_APP_ID;
const APP_SECRET = process.env.PRIVY_APP_SECRET;
const AUTH_KEY = process.env.PRIVY_AUTHORIZATION_KEY;
const MANDATE_SIGNER_ID = process.env.PRIVY_MANDATE_SIGNER_ID;
const WALLET_ID = process.env.PRIVY_MODE_C_WALLET_ID;
const OWNER_AUTH_KEY = process.env.PRIVY_OWNER_AUTHORIZATION_KEY;
const API_BASE = (process.env.PRIVY_API_BASE ?? 'https://api.privy.io').replace(/\/$/, '');

const LIVE = Boolean(
	APP_ID && APP_SECRET && AUTH_KEY && MANDATE_SIGNER_ID && WALLET_ID && OWNER_AUTH_KEY
);

const LOG_ID = 'c3d4e5f67890abcdef1234567890abcdef';
const KEY_REF = 'mode-c-live-key';
const SIGNER_URL =
	process.env.MANDATE_SIGNER_URL ?? 'https://mandate-signer-prod.example.workers.dev/v1/sign';
const TIMEOUT_MS = 90_000;

describe.skipIf(!LIVE)('Mode C onboarding (live Privy)', () => {
	let client: PrivyRestClient;

	beforeAll(() => {
		client = new PrivyRestClient({
			appId: APP_ID!,
			appSecret: APP_SECRET!,
			apiBase: API_BASE
		});
	}, TIMEOUT_MS);

	it(
		'creates delegation policy and onboards mandate as additional signer',
		async () => {
			const policy = await createDelegationSigningPolicy(
				client,
				`Mandate Mode C live ${Date.now()}`
			);
			expect(policy.id).toBeTruthy();

			const output = await onboardModeCWallet(client, {
				walletId: WALLET_ID!,
				mandateSignerId: MANDATE_SIGNER_ID!,
				keyRef: KEY_REF,
				logId: LOG_ID,
				signerUrl: SIGNER_URL,
				ownerAuthorizationKey: OWNER_AUTH_KEY!,
				policyId: policy.id
			});

			expect(output.walletAddress).toMatch(/^0x[0-9a-fA-F]{40}$/);
			expect(output.keyDirectory[KEY_REF]?.requiresAuthorizationSignature).toBe(true);
			expect(output.operatorRootKeys[LOG_ID]?.kind).toBe('remote');

			const walletBody = await getWallet(client, WALLET_ID!);
			assertMandateIsAdditionalSignerOnly(walletBody, MANDATE_SIGNER_ID!);
		},
		TIMEOUT_MS
	);

	it(
		'allows secp256k1_sign and denies high-risk rpc methods under policy',
		async () => {
			const hash = `0x${Buffer.from(randomBytes(32)).toString('hex')}`;
			const signResult = await walletRpcAttempt(client, {
				walletId: WALLET_ID!,
				method: 'secp256k1_sign',
				params: { hash },
				authorizationKey: AUTH_KEY
			});
			expect(signResult.ok, signResult.body).toBe(true);

			// exportPrivateKey/exportSeedPhrase are owner-only (I2), not rpc-routed for
			// additional signers — policy DENY entries are belt-and-braces; live matrix
			// covers rpc methods mandate could otherwise invoke.
			const deniedMethods: Array<{ method: string; params: Record<string, unknown> }> = [
				{
					method: 'eth_sendTransaction',
					params: {
						transaction: {
							to: '0x0000000000000000000000000000000000000001',
							value: '0x0',
							chain_id: 1
						}
					}
				},
				{
					method: 'personal_sign',
					params: {
						message: '0x68656c6c6f',
						encoding: 'hex'
					}
				},
				{
					method: 'eth_signTypedData_v4',
					params: {
						typed_data: {
							types: {
								EIP712Domain: [
									{ name: 'name', type: 'string' },
									{ name: 'version', type: 'string' },
									{ name: 'chainId', type: 'uint256' },
									{ name: 'verifyingContract', type: 'address' }
								]
							},
							primaryType: 'EIP712Domain',
							domain: {
								name: 'Mandate Mode C live deny test',
								version: '1',
								chainId: 1,
								verifyingContract: '0x0000000000000000000000000000000000000001'
							},
							message: {}
						}
					}
				}
			];

			for (const denied of deniedMethods) {
				const result = await walletRpcAttempt(client, {
					walletId: WALLET_ID!,
					method: denied.method,
					params: denied.params,
					authorizationKey: AUTH_KEY
				});
				expect(result.ok, `${denied.method}: ${result.body}`).toBe(false);
				expect(result.status).toBeGreaterThanOrEqual(400);
			}
		},
		TIMEOUT_MS
	);
});
