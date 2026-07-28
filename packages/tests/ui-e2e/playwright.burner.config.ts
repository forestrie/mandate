import { defineConfig, devices } from '@playwright/test';

// Burner-backend variant of the hermetic UI e2e (plan-2607-01 D2, FOR-322).
// Separate build/preview because the signing backend is a build-time choice:
// this serves the UI with PUBLIC_MANDATE_SIGNER_BACKEND=burner on its own port
// so it never collides with the default Privy-mock run.
const UI_PORT = 4174;
const baseURL = `http://127.0.0.1:${UI_PORT}`;

const e2ePublicEnv = {
	PUBLIC_MANDATE_PRIVY_APP_ID: 'e2e-placeholder',
	PUBLIC_MANDATE_PRIVY_CLIENT_ID: 'e2e-placeholder',
	PUBLIC_COORDINATOR_BFF_BASE: '/api/coordinator',
	PUBLIC_DEFAULT_CHAIN_ID: '84532',
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
		['html', { open: 'never', outputFolder: 'playwright-report-burner' }],
		['json', { outputFile: 'test-results/results-burner.json' }],
		['list']
	],
	use: {
		trace: 'on-first-retry',
		screenshot: 'only-on-failure',
		video: 'retain-on-failure'
	},
	projects: [
		{
			name: 'ui-burner',
			testMatch: ['**/ui/burner-*.spec.ts'],
			use: {
				...devices['Desktop Chrome'],
				baseURL
			}
		}
	],
	webServer: {
		// Serve via wrangler with PUBLIC_MANDATE_SIGNER_BACKEND as a worker binding so
		// $env/dynamic/public surfaces it at runtime (the CF-adapter path). Own port
		// avoids reusing a stale Privy-mode server from the default config.
		command:
			`pnpm --filter @mandate/ui build && ` +
			`pnpm --filter @mandate/ui exec wrangler pages dev .svelte-kit/cloudflare ` +
			`--port ${UI_PORT} --binding PUBLIC_MANDATE_SIGNER_BACKEND=burner`,
		url: baseURL,
		reuseExistingServer: !process.env.CI,
		timeout: 180_000,
		env: e2ePublicEnv
	}
});
