import { describe, expect, it } from 'vitest';
import { KeyDirectory, KeyDirectoryError } from '../src/key-directory.js';

const LOG_ID = 'b2c3d4e5f67890ab1234567890abcdef';
const ROOT = '0x0000000000000000000000000000000000000001';

describe('KeyDirectory', () => {
	it('parses requiresAuthorizationSignature when present', () => {
		const directory = new KeyDirectory(
			JSON.stringify({
				'mode-c-key': {
					walletId: 'wallet-owned',
					rootSignerAddress: ROOT,
					logIds: [LOG_ID],
					requiresAuthorizationSignature: true
				},
				'operator-key': {
					walletId: 'wallet-app',
					rootSignerAddress: ROOT,
					logIds: [LOG_ID],
					requiresAuthorizationSignature: false
				}
			})
		);
		expect(directory.resolve('mode-c-key', LOG_ID, ROOT).requiresAuthorizationSignature).toBe(true);
		expect(directory.resolve('operator-key', LOG_ID, ROOT).requiresAuthorizationSignature).toBe(
			false
		);
	});

	it('defaults requiresAuthorizationSignature to undefined when omitted', () => {
		const directory = new KeyDirectory(
			JSON.stringify({
				'test-key': {
					walletId: 'wallet-1',
					rootSignerAddress: ROOT,
					logIds: [LOG_ID]
				}
			})
		);
		expect(
			directory.resolve('test-key', LOG_ID, ROOT).requiresAuthorizationSignature
		).toBeUndefined();
	});

	it('rejects non-boolean requiresAuthorizationSignature', () => {
		const directory = new KeyDirectory(
			JSON.stringify({
				'bad-key': {
					walletId: 'wallet-1',
					rootSignerAddress: ROOT,
					logIds: [LOG_ID],
					requiresAuthorizationSignature: 'yes'
				}
			})
		);
		expect(() => directory.resolve('bad-key', LOG_ID, ROOT)).toThrow(
			/requiresAuthorizationSignature/
		);
	});

	it('allows any logId when logIds contains "*"', () => {
		const otherLogId = 'a1b2c3d4e5f678901234567890abcdef';
		const directory = new KeyDirectory(
			JSON.stringify({
				'wildcard-key': {
					walletId: 'wallet-1',
					rootSignerAddress: ROOT,
					logIds: ['*']
				}
			})
		);
		expect(directory.resolve('wildcard-key', otherLogId, ROOT).walletId).toBe('wallet-1');
	});

	it('rejects unknown keyRef', () => {
		const directory = new KeyDirectory(
			JSON.stringify({
				'test-key': {
					walletId: 'wallet-1',
					rootSignerAddress: ROOT,
					logIds: [LOG_ID]
				}
			})
		);
		expect(() => directory.resolve('missing', LOG_ID, ROOT)).toThrow(KeyDirectoryError);
	});
});
