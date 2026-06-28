import { expect, type Page } from '@playwright/test';
import { E2E_MOCK_WALLET_ADDRESS } from '../mocks/e2e-wallet.js';

const E2E_EMAIL = 'e2e-operator@forestrie.dev';
const E2E_OTP = '000000';

/** Drive the in-DOM Privy email OTP login flow (mock Privy accepts any code). */
export async function loginWithMockPrivy(page: Page): Promise<void> {
	await page.getByPlaceholder('Email for Privy login').fill(E2E_EMAIL);
	await page.getByRole('button', { name: 'Send code' }).click();
	await page.getByTestId('privy-otp').fill(E2E_OTP);
	await page.getByRole('button', { name: 'Connect wallet' }).click();
	await expect(page.getByText(`${E2E_MOCK_WALLET_ADDRESS.slice(0, 6)}`)).toBeVisible();
}

/** Click Load pending on the delegation console. */
export async function loadPending(page: Page): Promise<void> {
	await page.getByRole('button', { name: 'Load pending' }).click();
}

export { E2E_EMAIL, E2E_OTP, E2E_MOCK_WALLET_ADDRESS };
