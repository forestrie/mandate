import { describe, expect, it } from 'vitest';
import {
	checkOnboardRequestAttestationInputs,
	type OnboardRequestAttestationArgs
} from '../src/onboard-request-attestation-inputs.js';

const ROOT = `0x${'ab'.repeat(20)}`;
const LOG_ID = 'b2c3d4e5f67890ab1234567890abcdef';
const SIGNER_URL = 'https://signer.test/v1/sign';
const SIGNER_URL_LABEL = 'a signer URL (--signer-url or MANDATE_SIGNER_URL)';

describe('checkOnboardRequestAttestationInputs', () => {
	it('passes every input through when all are present', () => {
		expect(
			checkOnboardRequestAttestationInputs({
				rootSignerAddress: ROOT,
				logIdHex32: LOG_ID,
				signerUrl: SIGNER_URL
			})
		).toEqual({ ok: true, rootSignerAddress: ROOT, logIdHex32: LOG_ID, signerUrl: SIGNER_URL });
	});

	it.each<[string, OnboardRequestAttestationArgs, string[]]>([
		['--root-address', { logIdHex32: LOG_ID, signerUrl: SIGNER_URL }, ['--root-address']],
		['--log-id', { rootSignerAddress: ROOT, signerUrl: SIGNER_URL }, ['--log-id']],
		['the signer URL', { rootSignerAddress: ROOT, logIdHex32: LOG_ID }, [SIGNER_URL_LABEL]],
		[
			'an empty --log-id',
			{ rootSignerAddress: ROOT, logIdHex32: '', signerUrl: SIGNER_URL },
			['--log-id']
		],
		['every input', {}, ['--root-address', '--log-id', SIGNER_URL_LABEL]]
	])('refuses a request missing %s', (_name, args, missing) => {
		expect(checkOnboardRequestAttestationInputs(args)).toEqual({ ok: false, missing });
	});
});
