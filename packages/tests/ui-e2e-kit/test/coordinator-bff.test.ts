import { chromium } from '@playwright/test';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { installCoordinatorMocks } from '../src/coordinator-bff.js';
import { samplePendingEntry } from '../src/fixtures.js';

describe('installCoordinatorMocks', () => {
	let browser: Awaited<ReturnType<typeof chromium.launch>>;

	beforeAll(async () => {
		browser = await chromium.launch();
	});

	afterAll(async () => {
		await browser?.close();
	});

	it('serves mocked pending entries on coordinator BFF routes', async () => {
		const page = await browser.newPage();
		const entry = samplePendingEntry({ id: 'mock-pending-1' });
		await installCoordinatorMocks(page, { pendingEntries: [entry] });
		await page.goto('about:blank');

		const body = await page.evaluate(async () => {
			const res = await fetch(
				'https://ui.test/api/coordinator/delegations/pending?logId=abc'
			);
			return { status: res.status, json: (await res.json()) as { entries: Array<{ id: string }> } };
		});

		expect(body.status).toBe(200);
		expect(body.json.entries).toHaveLength(1);
		expect(body.json.entries[0]?.id).toBe('mock-pending-1');

		await page.close();
	});
});
