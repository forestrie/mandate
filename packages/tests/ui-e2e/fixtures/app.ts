import { test as base } from '@playwright/test';
import { installCoordinatorMocks, type CoordinatorMockOptions } from '../mocks/coordinator-bff.js';
import { E2E_AUTH_LOG_ID } from '../mocks/fixtures.js';

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
export {
	loginWithMockPrivy,
	loadPending,
	E2E_EMAIL,
	E2E_OTP,
	E2E_MOCK_WALLET_ADDRESS
} from './privy-login.js';

export { E2E_AUTH_LOG_ID };
