import { describe, expect, it } from 'vitest';
import { resolveRemoteBearerToken } from '../src/signer/resolve-remote-bearer.js';

describe('resolveRemoteBearerToken', () => {
	it('returns mandate token when bearerEnvKey is absent', () => {
		expect(
			resolveRemoteBearerToken(
				{
					alg: 'KS256',
					rootSignerAddress: '0x1',
					kind: 'remote',
					signerUrl: 'https://signer.example/v1/sign',
					keyRef: 'ref'
				},
				'mandate-token',
				{}
			)
		).toBe('mandate-token');
	});

	it('returns env value when bearerEnvKey is set', () => {
		expect(
			resolveRemoteBearerToken(
				{
					alg: 'KS256',
					rootSignerAddress: '0x1',
					kind: 'remote',
					signerUrl: 'https://user-signer.example/v1/sign',
					keyRef: 'ref',
					bearerEnvKey: 'USER_SIGNER_BEARER'
				},
				'mandate-token',
				{ USER_SIGNER_BEARER: 'user-token' }
			)
		).toBe('user-token');
	});
});
