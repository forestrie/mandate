import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const CLI_SOURCE = readFileSync(
	join(dirname(fileURLToPath(import.meta.url)), '../src/cli.ts'),
	'utf8'
);

describe('mandate-register onboard request CLI attestation (plan-2607-45 slice 02)', () => {
	it('documents the attestation flags and signer env in usage', () => {
		expect(CLI_SOURCE).toContain('--root-address');
		expect(CLI_SOURCE).toContain('--log-id');
		expect(CLI_SOURCE).toContain('--signer-url');
		expect(CLI_SOURCE).toContain('MANDATE_SIGNER_URL');
		expect(CLI_SOURCE).toContain('MANDATE_SIGNER_TOKEN');
	});

	it('arms attestation from MANDATE_SIGNER_URL env, not only flags (M2)', () => {
		expect(CLI_SOURCE).toContain("envOr(readFlag('--signer-url'), 'MANDATE_SIGNER_URL')");
		expect(CLI_SOURCE).toContain('!rootSignerAddress && !logIdHex32 && !signerUrl');
	});

	it('fails loudly on a partial attestation flag set instead of posting unattested', () => {
		expect(CLI_SOURCE).toContain('attested onboard request needs');
	});

	it('rejects an unknown --mode instead of coercing to Privy-custody (M3)', () => {
		expect(CLI_SOURCE).toContain('unknown delegation mode');
		expect(CLI_SOURCE).not.toContain("modeRaw === 'B' || modeRaw === 'D' ? modeRaw : 'C'");
	});
});
