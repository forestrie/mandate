/**
 * Live e2e: self-service onboard request → approve (ops or dev auto-approve) → redeem.
 *
 * canopy refuses an onboard request without the bootstrap-key attestation
 * (devdocs ADR-0059 decision 8), so the test signs one the way the CLI does:
 * `buildOnboardAttestationKs256Remote` posts the Sig_structure to the
 * `@mandate/signer` `/v1/sign` route, run here in-process with the Privy
 * credentials (as `provision-e2e.live.test.ts` does). The bootstrap key stays
 * in Privy custody. It is the Mode C test wallet: `live-provision` runs
 * genesis on the same E2E_CANOPY_UNIVOCITY_ADDR with that wallet as the KS256
 * bootstrap key, so the contract's `bootstrapConfig()` names it.
 *
 * Skips when the canopy, chain, Univocity or Privy inputs are unset.
 *
 *   doppler run --project mandate-forestrie --config dev -- \
 *   doppler run --project mandate-forestrie --config e2e -- \
 *     pnpm --filter @mandate/register test:live:onboard
 */

import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { handleSign } from '../../signer/src/handle-sign.js';
import type { Env as SignerEnv } from '../../signer/src/env.js';
import { buildOnboardAttestationKs256Remote } from '../src/onboard-attestation.js';
import {
	getOnboardRequestStatus,
	redeemOnboardToken,
	requestOnboardToken
} from '../src/onboard-client.js';

const canopyBaseUrl = process.env.E2E_CANOPY_API_URL?.trim();
const opsToken = process.env.E2E_CANOPY_OPS_ADMIN_TOKEN?.trim();
const chainId = process.env.E2E_CANOPY_CHAIN_ID?.trim();
const univocityAddr = process.env.E2E_CANOPY_UNIVOCITY_ADDR?.trim();

const appId = process.env.MANDATE_PRIVY_APP_ID?.trim();
const appSecret = process.env.MANDATE_PRIVY_APP_SECRET?.trim();
const privyApiBase = process.env.MANDATE_PRIVY_API_BASE?.trim().replace(/\/$/, '');
const authorizationKey = process.env.MANDATE_PRIVY_AUTHORIZATION_KEY?.trim();
const walletId = process.env.E2E_MODE_C_USER_PRIVY_WALLET_ID?.trim();

const liveReady =
	!!canopyBaseUrl &&
	!!chainId &&
	!!univocityAddr &&
	!!appId &&
	!!appSecret &&
	!!privyApiBase &&
	!!authorizationKey &&
	!!walletId;

// The signer runs in-process, so its URL, bearer, keyRef and authorised log
// id are local to this test; only the Privy wallet behind them is real.
const SIGNER_URL = 'http://signer.test/v1/sign';
const SIGNER_TOKEN = 'live-onboard-signer-token';
const KEY_REF = 'onboard-live';
const LOG_ID = randomBytes(16).toString('hex');

async function resolveWalletAddress(): Promise<string> {
	const provided = process.env.E2E_MODE_C_USER_WALLET_ADDRESS?.trim();
	if (provided) return provided;
	const basicAuth = Buffer.from(`${appId}:${appSecret}`).toString('base64');
	const response = await fetch(`${privyApiBase}/v1/wallets/${walletId}`, {
		headers: { Authorization: `Basic ${basicAuth}`, 'privy-app-id': appId! }
	});
	if (!response.ok) {
		throw new Error(`wallet lookup failed: ${response.status}`);
	}
	const body = (await response.json()) as { address?: string };
	if (!body.address) throw new Error('wallet missing address');
	return body.address;
}

/** Sign the attestation through `/v1/sign`; Privy holds the bootstrap key. */
async function buildAttestationInCustody(rootSignerAddress: string): Promise<Uint8Array> {
	const signerEnv: SignerEnv = {
		MANDATE_SIGNER_TOKEN: SIGNER_TOKEN,
		MANDATE_PRIVY_APP_ID: appId!,
		MANDATE_PRIVY_APP_SECRET: appSecret!,
		MANDATE_PRIVY_API_BASE: privyApiBase!,
		MANDATE_PRIVY_AUTHORIZATION_KEY: authorizationKey,
		KEY_DIRECTORY: JSON.stringify({
			[KEY_REF]: {
				walletId: walletId!,
				rootSignerAddress,
				logIds: [LOG_ID],
				requiresAuthorizationSignature: true
			}
		})
	};
	const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
		if (String(input) !== SIGNER_URL) {
			throw new Error(`unexpected fetch: ${String(input)}`);
		}
		return handleSign(new Request(SIGNER_URL, init), { env: signerEnv });
	}) as typeof fetch;

	return buildOnboardAttestationKs256Remote(
		{
			signerUrl: SIGNER_URL,
			bearerToken: SIGNER_TOKEN,
			keyRef: KEY_REF,
			rootSignerAddress,
			logIdHex32: LOG_ID,
			fetchImpl
		},
		{
			chainId: chainId!,
			univocityAddr: univocityAddr!.replace(/^0x/i, '').toLowerCase(),
			aud: new URL(canopyBaseUrl!).origin,
			nowSec: Math.floor(Date.now() / 1000)
		}
	);
}

async function ensureApproved(requestId: string, initialStatus: string): Promise<void> {
	if (initialStatus === 'approved') {
		return;
	}

	let status = initialStatus;
	for (let attempt = 0; attempt < 5 && status === 'pending'; attempt += 1) {
		await new Promise((resolve) => setTimeout(resolve, 500));
		const polled = await getOnboardRequestStatus(canopyBaseUrl!, requestId);
		status = polled.status;
		if (status === 'approved') {
			return;
		}
	}

	if (status !== 'pending') {
		throw new Error(`onboard live: unexpected status ${status} before approve`);
	}

	if (!opsToken) {
		throw new Error(
			'onboard live: request still pending — set E2E_CANOPY_OPS_ADMIN_TOKEN or enable dev ONBOARD_AUTO_APPROVE'
		);
	}

	const { encodeCborDeterministic: encode } = await import('@forestrie/encoding');
	const approveRes = await fetch(
		`${canopyBaseUrl!.replace(/\/$/, '')}/api/onboarding/requests/${requestId}/approve`,
		{
			method: 'POST',
			headers: {
				Authorization: `Bearer ${opsToken}`,
				'Content-Type': 'application/cbor'
			},
			body: new Uint8Array(encode(new Map()))
		}
	);
	expect(approveRes.status).toBe(200);
}

describe.skipIf(!liveReady)('onboard self-service live', () => {
	it('request → approve → redeem returns usable token', async () => {
		const attestation = await buildAttestationInCustody(await resolveWalletAddress());
		const requested = await requestOnboardToken({
			canopyBaseUrl: canopyBaseUrl!,
			label: `live-onboard-${Date.now()}`,
			chainId: chainId!,
			univocityAddr: univocityAddr!,
			contactEmail: 'live-test@forestrie.dev',
			attestation
		});

		await ensureApproved(requested.requestId, requested.status);

		const status = await getOnboardRequestStatus(canopyBaseUrl!, requested.requestId);
		expect(status.status).toBe('approved');

		const token = await redeemOnboardToken({
			canopyBaseUrl: canopyBaseUrl!,
			requestId: requested.requestId,
			redeemCode: requested.redeemCode
		});
		expect(token.length).toBeGreaterThan(0);
	});
});

describe('onboard self-service live preflight', () => {
	it.skipIf(liveReady)(
		'skipped — set E2E_CANOPY_API_URL, E2E_CANOPY_CHAIN_ID, E2E_CANOPY_UNIVOCITY_ADDR, MANDATE_PRIVY_APP_ID, MANDATE_PRIVY_APP_SECRET, MANDATE_PRIVY_API_BASE, MANDATE_PRIVY_AUTHORIZATION_KEY and E2E_MODE_C_USER_PRIVY_WALLET_ID (the Mode C wallet is the instance bootstrap key and signs the required attestation)',
		() => {
			expect(liveReady).toBe(false);
		}
	);
});
