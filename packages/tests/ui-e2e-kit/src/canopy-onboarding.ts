import type { Page } from '@playwright/test';
import { decodeCborDeterministic, encodeCborDeterministic } from '@forestrie/encoding';

/**
 * Hermetic mocks for canopy's browser-direct onboarding + genesis routes,
 * exercised by the Safe 1x1 (Mode D) /onboard wizard (plan-2607-45 slice 04).
 * All bodies are CBOR, matching canopy's wire contract; the request CBOR is
 * decoded and recorded so specs can assert the attestation rode along.
 */

/** Univocity contract the mock chain reports code for. */
export const E2E_UNIVOCITY_ADDR = `0x${'c0de'.repeat(10)}`;

export const E2E_ONBOARD_REQUEST_ID = 'e2e-onboard-request-1';
export const E2E_ONBOARD_REDEEM_CODE = 'e2e-redeem-code';
export const E2E_ONBOARD_TOKEN = 'e2e-onboard-token';

export interface RecordedOnboardRequest {
	label: string;
	chainId: string;
	univocityAddr: string;
	contactEmail: string;
	mandateOrigin?: string;
	/** Byte length of the COSE_Sign1 attestation (0 = absent). */
	attestationBytes: number;
}

export interface RecordedGenesisPost {
	/** Full request URL — specs assert Mode D sends NO webhookUrl param. */
	url: string;
	authorization: string;
	/** Genesis CBOR labels of interest. */
	bootstrapKeyHex: string;
	chainId: string;
}

export interface CanopyOnboardingMockOptions {
	/** Polls that report `pending` before the request turns `approved`. */
	pollsUntilApproved?: number;
	/** Return the D7 reservation conflict from genesis instead of 201. */
	genesisConflictDetail?: string;
	/** Coordinator status genesis reports (default publicRoot ok, webhook skipped). */
	coordinator?: { publicRoot: string; webhook: string };
	chainId?: string;
	univocityAddr?: string;
}

function cborResponse(
	status: number,
	value: unknown
): { status: number; body: Buffer; contentType: string } {
	return {
		status,
		contentType: 'application/cbor',
		body: Buffer.from(encodeCborDeterministic(value))
	};
}

function bytesToHex(bytes: Uint8Array): string {
	return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export interface CanopyOnboardingMockHandle {
	onboardRequests: RecordedOnboardRequest[];
	genesisPosts: RecordedGenesisPost[];
	statusPolls: () => number;
}

export async function installCanopyOnboardingMocks(
	page: Page,
	options: CanopyOnboardingMockOptions = {}
): Promise<CanopyOnboardingMockHandle> {
	const pollsUntilApproved = options.pollsUntilApproved ?? 1;
	const chainId = options.chainId ?? '84532';
	const univocityAddr = (options.univocityAddr ?? E2E_UNIVOCITY_ADDR)
		.replace(/^0x/i, '')
		.toLowerCase();
	const coordinator = options.coordinator ?? { publicRoot: 'ok', webhook: 'skipped' };

	const onboardRequests: RecordedOnboardRequest[] = [];
	const genesisPosts: RecordedGenesisPost[] = [];
	let polls = 0;

	await page.route('**/api/onboarding/requests', async (route) => {
		if (route.request().method() !== 'POST') return route.fallback();
		const raw = route.request().postDataBuffer();
		const decoded = decodeCborDeterministic(new Uint8Array(raw ?? new Uint8Array())) as Map<
			number,
			unknown
		>;
		const attestation = decoded.get(7) as Uint8Array | undefined;
		onboardRequests.push({
			label: String(decoded.get(1) ?? ''),
			chainId: String(decoded.get(2) ?? ''),
			univocityAddr: String(decoded.get(3) ?? ''),
			contactEmail: String(decoded.get(4) ?? ''),
			mandateOrigin: decoded.get(5) != null ? String(decoded.get(5)) : undefined,
			attestationBytes: attestation?.length ?? 0
		});
		const { status, body, contentType } = cborResponse(201, {
			requestId: E2E_ONBOARD_REQUEST_ID,
			status: 'pending',
			expiresAt: Math.floor(Date.now() / 1000) + 3600,
			redeemCode: E2E_ONBOARD_REDEEM_CODE
		});
		await route.fulfill({ status, contentType, body });
	});

	await page.route(`**/api/onboarding/requests/${E2E_ONBOARD_REQUEST_ID}`, async (route) => {
		if (route.request().method() !== 'GET') return route.fallback();
		polls += 1;
		const { status, body, contentType } = cborResponse(200, {
			requestId: E2E_ONBOARD_REQUEST_ID,
			status: polls > pollsUntilApproved ? 'approved' : 'pending',
			expiresAt: Math.floor(Date.now() / 1000) + 3600
		});
		await route.fulfill({ status, contentType, body });
	});

	await page.route(`**/api/onboarding/requests/${E2E_ONBOARD_REQUEST_ID}/redeem`, async (route) => {
		if (route.request().method() !== 'POST') return route.fallback();
		const { status, body, contentType } = cborResponse(200, {
			token: E2E_ONBOARD_TOKEN,
			ref: 'e2e-token-ref',
			label: 'e2e'
		});
		await route.fulfill({ status, contentType, body });
	});

	await page.route('**/api/forest/*/genesis*', async (route) => {
		if (route.request().method() !== 'POST') return route.fallback();
		const request = route.request();
		const url = request.url();
		const raw = request.postDataBuffer();
		const decoded = decodeCborDeterministic(new Uint8Array(raw ?? new Uint8Array())) as Map<
			number,
			unknown
		>;
		genesisPosts.push({
			url,
			authorization: request.headers()['authorization'] ?? '',
			bootstrapKeyHex: bytesToHex((decoded.get(-68015) as Uint8Array) ?? new Uint8Array()),
			chainId: String(decoded.get(-68013) ?? '')
		});
		if (options.genesisConflictDetail) {
			await route.fulfill({
				status: 409,
				contentType: 'text/plain',
				body: options.genesisConflictDetail
			});
			return;
		}
		const forestR = decodeURIComponent(new URL(url).pathname.split('/')[3] ?? '');
		const { status, body, contentType } = cborResponse(201, {
			R: forestR,
			chainBinding: { chainId, univocityAddr },
			coordinator
		});
		await route.fulfill({ status, contentType, body });
	});

	return { onboardRequests, genesisPosts, statusPolls: () => polls };
}
