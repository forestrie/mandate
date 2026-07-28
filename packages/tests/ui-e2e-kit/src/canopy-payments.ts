import type { Page } from '@playwright/test';

/**
 * Browser-level mock of canopy's payer/owner-facing payment routes for the
 * fee surface (FOR-485, plan-2607-02 R3). Path-matched (host-agnostic) so it
 * intercepts whichever `PUBLIC_CANOPY_API_URL` the build resolved; nothing
 * reaches a real canopy. CORS headers mirror canopy#197 so the mock behaves
 * the same whether the app calls same-origin or cross-origin.
 *
 * Settlement model: a paid purchase is credited on the NEXT account read —
 * the cheapest honest rendering of the 202 "credits land after on-chain
 * settlement" posture the console must honour.
 */

/** Fixed instance the mock serves; anything else 404s. */
export const E2E_UNIVOCITY_INSTANCE_ID = `eip155:84532:0x${'e2'.repeat(20)}`;

/** Mirrors canopy's default dev pricing: $0.01 USDC (6 dp) per credit. */
const CREDIT_PRICE_ATOMIC = 10_000n;

const CORS_HEADERS = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-PAYMENT',
	'Access-Control-Expose-Headers': 'X-PAYMENT-REQUIRED, X-PAYMENT-RESPONSE'
};

/** ASCII-safe base64 via the Node 22 / browser global (kit has no DOM lib). */
function toBase64(ascii: string): string {
	const btoaFn = (globalThis as { btoa?: (data: string) => string }).btoa;
	if (!btoaFn) throw new Error('btoa is unavailable in this runtime');
	return btoaFn(ascii);
}

export interface CanopyPaymentsMockOptions {
	univocityInstanceId?: string;
	initialBalance?: number;
	checkpointsAccrued?: number;
	arrears?: string;
	enforcementFrozen?: boolean;
}

export interface CanopyPaymentsMockState {
	/** Balance served by the account read. */
	balance: number;
	/** Credits paid for but not yet visible (settle on next read). */
	pendingCredits: number;
	/** Purchases the mock accepted (X-PAYMENT present). */
	purchases: Array<{ credits: number; amountAtomic: string }>;
}

/** Install the canopy payments mocks; returns mutable state for assertions. */
export async function installCanopyPaymentsMocks(
	page: Page,
	options: CanopyPaymentsMockOptions = {}
): Promise<CanopyPaymentsMockState> {
	const id = options.univocityInstanceId ?? E2E_UNIVOCITY_INSTANCE_ID;
	const state: CanopyPaymentsMockState = {
		balance: options.initialBalance ?? 0,
		pendingCredits: 0,
		purchases: []
	};

	await page.route('**/api/payments/**', async (route) => {
		const request = route.request();
		const url = new URL(request.url());
		const json = (status: number, body: unknown, headers?: Record<string, string>) =>
			route.fulfill({
				status,
				contentType: 'application/json',
				headers: { ...CORS_HEADERS, ...headers },
				body: JSON.stringify(body)
			});

		if (request.method() === 'OPTIONS') {
			await route.fulfill({ status: 204, headers: CORS_HEADERS });
			return;
		}

		const accountMatch = url.pathname.match(/\/api\/payments\/accounts\/([^/]+)$/);
		if (request.method() === 'GET' && accountMatch) {
			const authorization = request.headers()['authorization'] ?? '';
			if (!authorization.startsWith('Forestrie-Account-Read ')) {
				await json(401, {
					type: 'about:blank',
					title: 'Unauthorized',
					status: 401,
					detail: 'Authorization: Forestrie-Account-Read <base64url COSE_Sign1> required'
				});
				return;
			}
			if (decodeURIComponent(accountMatch[1]!) !== id) {
				await json(404, { type: 'about:blank', title: 'Not Found', status: 404 });
				return;
			}
			state.balance += state.pendingCredits;
			state.pendingCredits = 0;
			await json(200, {
				univocityInstanceId: id,
				creditsBalance: state.balance,
				checkpointsAccrued: options.checkpointsAccrued ?? 3,
				arrears: options.arrears ?? 'current',
				enforcementFrozen: options.enforcementFrozen ?? false,
				watermarkBlock: 123456,
				registrationBlock: 998877
			});
			return;
		}

		const creditsMatch = url.pathname.match(/\/api\/payments\/credits\/([^/]+)$/);
		if (request.method() === 'POST' && creditsMatch) {
			if (decodeURIComponent(creditsMatch[1]!) !== id) {
				await json(404, { error: 'unknown univocity instance' });
				return;
			}
			const credits = Number.parseInt(url.searchParams.get('credits') ?? '100', 10);
			const amountAtomic = (CREDIT_PRICE_ATOMIC * BigInt(credits)).toString();
			const xPayment = request.headers()['x-payment'];
			if (!xPayment) {
				const requirements = {
					x402Version: 2,
					accepts: [
						{
							scheme: 'exact',
							network: 'eip155:84532',
							amount: amountAtomic,
							asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
							payTo: `0x${'aa'.repeat(20)}`,
							maxTimeoutSeconds: 300,
							extra: { name: 'USDC', version: '2' }
						}
					],
					resource: {
						url: request.url(),
						description: 'credits purchase',
						mimeType: 'application/json'
					}
				};
				await json(
					402,
					{ univocityInstanceId: id, credits, amountAtomic },
					{ 'X-PAYMENT-REQUIRED': toBase64(JSON.stringify(requirements)) }
				);
				return;
			}
			state.pendingCredits += credits;
			state.purchases.push({ credits, amountAtomic });
			await json(202, { univocityInstanceId: id, credits, amountAtomic, settlement: 'enqueued' });
			return;
		}

		await json(404, {
			error: `unmocked canopy payments path: ${request.method()} ${url.pathname}`
		});
	});

	return state;
}
