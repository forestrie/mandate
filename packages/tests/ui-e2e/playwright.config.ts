import { defineConfig, devices } from '@playwright/test';

const UI_PORT = 4173;
const baseURL = `http://127.0.0.1:${UI_PORT}`;

const e2ePublicEnv = {
	VITE_E2E_PRIVY_MOCK: 'true',
	PUBLIC_MANDATE_PRIVY_APP_ID: 'e2e-placeholder',
	PUBLIC_MANDATE_PRIVY_CLIENT_ID: 'e2e-placeholder',
	PUBLIC_COORDINATOR_BFF_BASE: '/api/coordinator',
	PUBLIC_DEFAULT_CHAIN_ID: '84532',
	// Same-origin so the mocked canopy routes need no CORS preflight; the
	// canopy-payments mock is path-matched and 404s anything unmocked.
	PUBLIC_CANOPY_API_URL: baseURL,
	CF_PAGES: '1',
	COORDINATOR_AUTH_MODE: 'app_token_bff',
	COORDINATOR_APP_TOKEN: 'e2e-placeholder',
	COORDINATOR_UPSTREAM_URL: 'http://127.0.0.1:9'
};

export default defineConfig({
	globalSetup: './global-setup.ts',
	testDir: './tests',
	timeout: 30_000,
	retries: process.env.CI ? 2 : 0,
	expect: { timeout: 5_000 },
	reporter: [
		['html', { open: 'never', outputFolder: 'playwright-report' }],
		['json', { outputFile: 'test-results/results.json' }],
		['list']
	],
	use: {
		trace: 'on-first-retry',
		screenshot: 'only-on-failure',
		video: 'retain-on-failure'
	},
	projects: [
		{
			name: 'ui',
			testMatch: ['**/ui/**/*.spec.ts'],
			// Burner specs need PUBLIC_MANDATE_SIGNER_BACKEND=burner — see playwright.burner.config.ts.
			testIgnore: ['**/ui/burner-*.spec.ts'],
			use: {
				...devices['Desktop Chrome'],
				baseURL
			}
		},
		{
			name: 'integration',
			testMatch: ['**/integration/**/*.spec.ts'],
			testIgnore: ['**/*']
		}
	],
	webServer: {
		command: 'pnpm --filter @mandate/ui build && pnpm --filter @mandate/ui preview',
		url: baseURL,
		reuseExistingServer: !process.env.CI,
		timeout: 180_000,
		env: e2ePublicEnv
	}
});
