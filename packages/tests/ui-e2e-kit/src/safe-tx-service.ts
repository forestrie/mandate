import type { Page } from '@playwright/test';

/**
 * Hermetic mock for the Safe Transaction Service gateway the /onboard deploy
 * branch proposes to browser-direct (plan-2607-47 Q4:
 * `api.safe.global/tx-service/basesep`). Path-matched on the
 * multisig-transactions collection so the suite never leaves the box.
 */

export interface RecordedSafeProposal {
	/** Safe address from the URL path. */
	safe: string;
	to: string;
	data: string;
	operation: number;
	nonce: string;
	contractTransactionHash: string;
	sender: string;
	signature: string;
	origin?: string;
}

export interface SafeTxServiceMockOptions {
	/** First N proposal POSTs answer 503 — the best-effort STS warn path (Q5). */
	proposalFailures?: number;
}

export interface SafeTxServiceMockHandle {
	proposals: RecordedSafeProposal[];
	proposalPosts: () => number;
}

export async function installSafeTxServiceMocks(
	page: Page,
	options: SafeTxServiceMockOptions = {}
): Promise<SafeTxServiceMockHandle> {
	const proposals: RecordedSafeProposal[] = [];
	let posts = 0;

	await page.route('**/tx-service/**/api/v1/safes/*/multisig-transactions/', async (route) => {
		if (route.request().method() !== 'POST') return route.fallback();
		posts += 1;
		if (options.proposalFailures !== undefined && posts <= options.proposalFailures) {
			await route.fulfill({
				status: 503,
				contentType: 'text/plain',
				body: 'e2e: Safe Transaction Service unavailable'
			});
			return;
		}
		const url = new URL(route.request().url());
		const safe = url.pathname.split('/safes/')[1]?.split('/')[0] ?? '';
		const body = route.request().postDataJSON() as Record<string, unknown>;
		proposals.push({
			safe,
			to: String(body.to ?? ''),
			data: String(body.data ?? ''),
			operation: Number(body.operation ?? -1),
			nonce: String(body.nonce ?? ''),
			contractTransactionHash: String(body.contractTransactionHash ?? ''),
			sender: String(body.sender ?? ''),
			signature: String(body.signature ?? ''),
			origin: body.origin != null ? String(body.origin) : undefined
		});
		await route.fulfill({ status: 201, contentType: 'application/json', body: '{}' });
	});

	return { proposals, proposalPosts: () => posts };
}
