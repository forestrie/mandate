import type { Page } from '@playwright/test';
import { keccak_256 } from '@noble/hashes/sha3';

/**
 * Hermetic mock for the Safe Transaction Service gateway the /onboard deploy
 * branch proposes to browser-direct (plan-2607-47 Q4:
 * `api.safe.global/tx-service/basesep`). Path-matched on the
 * multisig-transactions collection so the suite never leaves the box.
 *
 * Like the real STS, the mock checksum-validates every address field and
 * 422s lowercase input — the live service did exactly that to the first
 * console proposal while this mock accepted it (mandate#87), so leniency
 * here ships bugs.
 */

/** Strict EIP-55 acceptance, matching the real STS validator. */
function isChecksummedAddress(address: string): boolean {
	if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return false;
	const lower = address.slice(2).toLowerCase();
	const hash = keccak_256(new TextEncoder().encode(lower));
	let expected = '';
	for (let i = 0; i < 40; i++) {
		const nibble = (hash[i >> 1]! >> (i % 2 === 0 ? 4 : 0)) & 0xf;
		expected += nibble >= 8 ? lower[i]!.toUpperCase() : lower[i]!;
	}
	return address.slice(2) === expected;
}

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
		// The real STS validates all address fields and reports every failure
		// at once, with this exact (misspelt) message shape.
		const checksumErrors: Record<string, string[]> = {};
		for (const field of ['sender', 'to', 'gasToken', 'refundReceiver'] as const) {
			const value = String(body[field] ?? '');
			if (!isChecksummedAddress(value)) {
				checksumErrors[field] = [`Address ${value} is not checksumed`];
			}
		}
		if (!isChecksummedAddress(safe)) {
			checksumErrors.safe = [`Address ${safe} is not checksumed`];
		}
		if (Object.keys(checksumErrors).length > 0) {
			await route.fulfill({
				status: 422,
				contentType: 'application/json',
				body: JSON.stringify(checksumErrors)
			});
			return;
		}
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
