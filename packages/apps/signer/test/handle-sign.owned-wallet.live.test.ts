import { randomBytes } from 'node:crypto';
import { secp256k1 } from '@noble/curves/secp256k1';
import { beforeAll, describe, expect, it } from 'vitest';
import { handleSign } from '../src/handle-sign.js';
import type { Env } from '../src/env.js';
import {
	base64ToBytes,
	bytesToBase64,
	bytesToBigIntBE,
	hashSigStructure,
	recoverAddressFromSignature
} from './test-helpers.js';

/**
 * Live integration test for Privy **owned** wallets (Mode C path).
 *
 * Skipped unless PRIVY_APP_ID, PRIVY_APP_SECRET, PRIVY_WALLET_ID, and
 * PRIVY_AUTHORIZATION_KEY are set. The wallet must be user-owned with mandate
 * registered as an additional signer; the authorization key is the mandate
 * additional-signer P-256 key (`wallet-auth:`-prefixed base64 PKCS#8 DER).
 *
 *   doppler run --project mandate-forestrie --config dev -- \
 *     pnpm --filter @mandate/signer test:live:owned
 */

const APP_ID = process.env.PRIVY_APP_ID;
const APP_SECRET = process.env.PRIVY_APP_SECRET;
const WALLET_ID = process.env.PRIVY_WALLET_ID;
const AUTHORIZATION_KEY = process.env.PRIVY_AUTHORIZATION_KEY;
const API_BASE = (process.env.PRIVY_API_BASE ?? 'https://api.privy.io').replace(/\/$/, '');
const LIVE = Boolean(APP_ID && APP_SECRET && WALLET_ID && AUTHORIZATION_KEY);

const LOG_ID = 'b2c3d4e5f67890ab1234567890abcdef';
const SIGNER_TOKEN = 'live-owned-signer-token';
const PRIVY_TIMEOUT_MS = 60_000;

async function resolveWalletAddress(): Promise<string> {
	const provided = process.env.PRIVY_WALLET_ADDRESS?.trim();
	if (provided) return provided;
	const basicAuth = Buffer.from(`${APP_ID}:${APP_SECRET}`).toString('base64');
	const response = await fetch(`${API_BASE}/v1/wallets/${WALLET_ID}`, {
		headers: { Authorization: `Basic ${basicAuth}`, 'privy-app-id': APP_ID! }
	});
	if (!response.ok) {
		throw new Error(
			`failed to resolve wallet ${WALLET_ID}: ${response.status} ${await response.text()} ` +
				'(set PRIVY_WALLET_ADDRESS to skip this lookup)'
		);
	}
	const body = (await response.json()) as { address?: string };
	if (!body.address) throw new Error('Privy wallet response missing address');
	return body.address;
}

describe.skipIf(!LIVE)('handleSign (live Privy owned wallet)', () => {
	let walletAddress: string;
	let env: Env;

	beforeAll(async () => {
		walletAddress = await resolveWalletAddress();
		env = {
			MANDATE_SIGNER_TOKEN: SIGNER_TOKEN,
			PRIVY_APP_ID: APP_ID!,
			PRIVY_APP_SECRET: APP_SECRET!,
			PRIVY_API_BASE: API_BASE,
			PRIVY_AUTHORIZATION_KEY: AUTHORIZATION_KEY,
			KEY_DIRECTORY: JSON.stringify({
				'live-owned-key': {
					walletId: WALLET_ID!,
					rootSignerAddress: walletAddress,
					logIds: [LOG_ID],
					requiresAuthorizationSignature: true
				}
			})
		};
	}, PRIVY_TIMEOUT_MS);

	it(
		'signs via owned-wallet path with authorization signature and recovers low-s',
		async () => {
			const sigStructure = new Uint8Array(randomBytes(32));
			const request = new Request('http://signer.test/v1/sign', {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${SIGNER_TOKEN}`,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					logId: LOG_ID,
					keyRef: 'live-owned-key',
					rootSignerAddress: walletAddress,
					sigStructure: bytesToBase64(sigStructure)
				})
			});

			const response = await handleSign(request, { env });
			expect(response.status).toBe(200);

			const body = (await response.json()) as { signature: string };
			const signature = base64ToBytes(body.signature);
			expect(signature.length).toBe(65);

			const s = bytesToBigIntBE(signature.slice(32, 64));
			expect(s <= secp256k1.CURVE.n >> 1n).toBe(true);

			const recovered = recoverAddressFromSignature(hashSigStructure(sigStructure), signature);
			expect(`0x${Buffer.from(recovered).toString('hex')}`.toLowerCase()).toBe(
				walletAddress.toLowerCase()
			);
		},
		PRIVY_TIMEOUT_MS
	);
});
