import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const CLI_SOURCE = readFileSync(
	join(dirname(fileURLToPath(import.meta.url)), '../src/cli.ts'),
	'utf8'
);

describe('mandate-register privy revoke-mode-c CLI', () => {
	it('lists revoke-mode-c in help output', () => {
		expect(CLI_SOURCE).toContain('privy revoke-mode-c');
	});

	it('documents required env in revoke-mode-c usage', () => {
		expect(CLI_SOURCE).toContain('usageRevokeModeC');
		expect(CLI_SOURCE).toContain('E2E_MODE_C_USER_PRIVY_WALLET_ID');
		expect(CLI_SOURCE).toContain('E2E_MODE_C_PRIVY_OWNER_AUTH_KEY');
		expect(CLI_SOURCE).toContain('MANDATE_PRIVY_APP_ID');
	});
});
