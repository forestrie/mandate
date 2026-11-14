/**
 * Live e2e: self-service onboard request → approve (ops or dev auto-approve) → redeem.
 * Skips when E2E_CANOPY_API_URL, chain, Univocity addr, or the bootstrap key
 * (E2E_CANOPY_BOOTSTRAP_KEY_HEX) are unset.
 */

import { secp256k1 } from '@noble/curves/secp256k1';
import { keccak_256 } from '@noble/hashes/sha3';
import { describe, expect, it } from 'vitest';
import { buildOnboardAttestationKs256 } from '../src/onboard-attestation.js';
import {
	getOnboardRequestStatus,
	redeemOnboardToken,
	requestOnboardToken
} from '../src/onboard-client.js';

const canopyBaseUrl = process.env.E2E_CANOPY_API_URL?.trim();
const opsToken = process.env.E2E_CANOPY_OPS_ADMIN_TOKEN?.trim();
const chainId = process.env.E2E_CANOPY_CHAIN_ID?.trim();
const univocityAddr = process.env.E2E_CANOPY_UNIVOCITY_ADDR?.trim();

/**
 * KS256 private key (hex) of the bootstrap EOA that the contract at
 * E2E_CANOPY_UNIVOCITY_ADDR declares; canopy refuses an unattested request
 * and verifies the attestation against that key.
 */
const bootstrapKeyHex = process.env.E2E_CANOPY_BOOTSTRAP_KEY_HEX?.trim().replace(/^0x/i, '');

const liveReady = !!canopyBaseUrl && !!chainId && !!univocityAddr && !!bootstrapKeyHex;

/** Sign keccak256(Sig_structure) in-process: 65-byte r‖s‖v, v in {0,1}. */
async function signWithBootstrapKey(sigStructure: Uint8Array): Promise<Uint8Array> {
	const sig = secp256k1.sign(keccak_256(sigStructure), bootstrapKeyHex!, { prehash: false });
	const out = new Uint8Array(65);
	out.set(sig.toCompactRawBytes(), 0);
	out[64] = sig.recovery ?? 0;
	return out;
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
		const attestation = await buildOnboardAttestationKs256(
			{
				chainId: chainId!,
				univocityAddr: univocityAddr!.replace(/^0x/i, '').toLowerCase(),
				aud: new URL(canopyBaseUrl!).origin,
				nowSec: Math.floor(Date.now() / 1000)
			},
			signWithBootstrapKey
		);
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
		'skipped — set E2E_CANOPY_API_URL, E2E_CANOPY_CHAIN_ID, E2E_CANOPY_UNIVOCITY_ADDR and E2E_CANOPY_BOOTSTRAP_KEY_HEX (the instance bootstrap key signs the required attestation)',
		() => {
			expect(liveReady).toBe(false);
		}
	);
});
