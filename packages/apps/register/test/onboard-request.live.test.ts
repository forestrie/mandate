/**
 * Live e2e: self-service onboard request → approve (ops or dev auto-approve) → redeem.
 * Skips when E2E_CANOPY_API_URL, chain, and Univocity addr are unset.
 */

import { describe, expect, it } from 'vitest';
import {
	getOnboardRequestStatus,
	redeemOnboardToken,
	requestOnboardToken
} from '../src/onboard-client.js';

const canopyBaseUrl = process.env.E2E_CANOPY_API_URL?.trim();
const opsToken = process.env.E2E_CANOPY_OPS_ADMIN_TOKEN?.trim();
const chainId = process.env.E2E_CANOPY_CHAIN_ID?.trim();
const univocityAddr = process.env.E2E_CANOPY_UNIVOCITY_ADDR?.trim();

const liveReady = !!canopyBaseUrl && !!chainId && !!univocityAddr;

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
		const requested = await requestOnboardToken({
			canopyBaseUrl: canopyBaseUrl!,
			label: `live-onboard-${Date.now()}`,
			chainId: chainId!,
			univocityAddr: univocityAddr!,
			contactEmail: 'live-test@forestrie.dev'
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
		'skipped — set E2E_CANOPY_API_URL, E2E_CANOPY_CHAIN_ID, E2E_CANOPY_UNIVOCITY_ADDR',
		() => {
			expect(liveReady).toBe(false);
		}
	);
});
