import { test as base } from '@playwright/test';
import { installCoordinatorMocks, type CoordinatorMockOptions } from './coordinator-bff.js';
import { E2E_AUTH_LOG_ID } from './fixtures.js';

type ConsoleFixtures = {
	consolePage: import('@playwright/test').Page;
	mocks: CoordinatorMockOptions;
};

export const test = base.extend<ConsoleFixtures>({
	mocks: [{}, { option: true }],
	consolePage: async ({ page, mocks }, use) => {
		await installCoordinatorMocks(page, mocks);
		await page.goto(`/delegations?authLogId=${encodeURIComponent(E2E_AUTH_LOG_ID)}`);
		await use(page);
	}
});

export { expect } from '@playwright/test';
