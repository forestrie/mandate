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
 * Live integration test against a real Privy server wallet (app-controlled path).
 *
 * Skipped unless MANDATE_PRIVY_APP_ID, MANDATE_PRIVY_APP_SECRET, and
 * E2E_SIGNER_TEST_PRIVY_WALLET_ID are set.
 *
 *   doppler run --project mandate-forestrie --config dev -- \
 *     pnpm --filter @mandate/signer test:live
 */

const APP_ID = process.env.MANDATE_PRIVY_APP_ID;
const APP_SECRET = process.env.MANDATE_PRIVY_APP_SECRET;
const WALLET_ID = process.env.E2E_SIGNER_TEST_PRIVY_WALLET_ID;
const API_BASE = process.env.MANDATE_PRIVY_API_BASE?.replace(/\/$/, '');
const LIVE = Boolean(APP_ID && APP_SECRET && WALLET_ID && API_BASE);

const LOG_ID = 'b2c3d4e5f67890ab1234567890abcdef';
const SIGNER_TOKEN = 'live-signer-token';
const PRIVY_TIMEOUT_MS = 60_000;

async function resolveWalletAddress(): Promise<string> {
	const provided = process.env.E2E_SIGNER_TEST_WALLET_ADDRESS?.trim();
	if (provided) return provided;
	const basicAuth = Buffer.from(`${APP_ID}:${APP_SECRET}`).toString('base64');
	const response = await fetch(`${API_BASE}/v1/wallets/${WALLET_ID}`, {
		headers: { Authorization: `Basic ${basicAuth}`, 'privy-app-id': APP_ID! }
	});
	if (!response.ok) {
		throw new Error(
			`failed to resolve wallet ${WALLET_ID}: ${response.status} ${await response.text()} ` +
				'(set E2E_SIGNER_TEST_WALLET_ADDRESS to skip this lookup)'
		);
	}
	const body = (await response.json()) as { address?: string };
	if (!body.address) throw new Error('Privy wallet response missing address');
	return body.address;
}

describe.skipIf(!LIVE)('handleSign (live Privy)', () => {
	let walletAddress: string;
	let env: Env;

	beforeAll(async () => {
		walletAddress = await resolveWalletAddress();
		env = {
			MANDATE_SIGNER_TOKEN: SIGNER_TOKEN,
			MANDATE_PRIVY_APP_ID: APP_ID!,
			MANDATE_PRIVY_APP_SECRET: APP_SECRET!,
			MANDATE_PRIVY_API_BASE: API_BASE!,
			KEY_DIRECTORY: JSON.stringify({
				'live-key': {
					walletId: WALLET_ID!,
					rootSignerAddress: walletAddress,
					logIds: [LOG_ID]
				}
			})
		};
	}, PRIVY_TIMEOUT_MS);

	it(
		'signs via real Privy and recovers a low-s signature to the wallet address',
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
					keyRef: 'live-key',
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
