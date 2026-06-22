import { describe, expect, it } from 'vitest';
import type { SignRequest, SignResponse } from '../src/index.js';

describe('@mandate/signer-contract', () => {
	it('exports SignRequest and SignResponse shapes', () => {
		const request: SignRequest = {
			logId: 'a'.repeat(32),
			keyRef: 'test-key',
			rootSignerAddress: '0x' + 'ab'.repeat(20),
			sigStructure: 'c2ln'
		};
		const response: SignResponse = { signature: 'c2ln' };
		expect(request.keyRef).toBe('test-key');
		expect(response.signature).toBe('c2ln');
	});
});
