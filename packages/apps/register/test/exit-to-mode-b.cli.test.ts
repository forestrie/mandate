import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const CLI_SOURCE = readFileSync(
	join(dirname(fileURLToPath(import.meta.url)), '../src/cli.ts'),
	'utf8'
);

describe('mandate-register privy exit-to-mode-b CLI', () => {
	it('lists exit-to-mode-b in help output', () => {
		expect(CLI_SOURCE).toContain('privy exit-to-mode-b');
	});

	it('dispatches the exit-to-mode-b subcommand', () => {
		expect(CLI_SOURCE).toContain("cmd === 'exit-to-mode-b'");
		expect(CLI_SOURCE).toContain('runExitToModeB');
	});

	it('documents required flags and env in exit-to-mode-b usage', () => {
		expect(CLI_SOURCE).toContain('usageExitToModeB');
		expect(CLI_SOURCE).toContain('--log-id');
		expect(CLI_SOURCE).toContain('E2E_USER_SIGNER_URL');
		expect(CLI_SOURCE).toContain('USER_SIGNER_BEARER');
	});

	it('warns that --user-signer-bearer is visible in process listings', () => {
		expect(CLI_SOURCE).toContain('visible in process listings');
	});
});
