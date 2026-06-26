/**
 * Live e2e: self-service onboard request → ops approve → redeem → provision.
 * Skips when canopy ops env incomplete (same pattern as provision-e2e.live.test.ts).
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

const liveReady = !!canopyBaseUrl && !!opsToken && !!chainId && !!univocityAddr;

describe.skipIf(!liveReady)('onboard self-service live', () => {
	it('request → approve → redeem returns usable token', async () => {
		const requested = await requestOnboardToken({
			canopyBaseUrl: canopyBaseUrl!,
			label: `live-onboard-${Date.now()}`,
			chainId: chainId!,
			univocityAddr: univocityAddr!,
			contactEmail: 'live-test@forestrie.dev'
		});

		// Ops approve via CBOR route
		const { encode } = await import('cbor-x');
		const approveRes = await fetch(
			`${canopyBaseUrl!.replace(/\/$/, '')}/api/onboarding/requests/${requested.requestId}/approve`,
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
	it.skipIf(liveReady)('skipped — set E2E_CANOPY_* + E2E_CANOPY_OPS_ADMIN_TOKEN', () => {
		expect(liveReady).toBe(false);
	});
});
