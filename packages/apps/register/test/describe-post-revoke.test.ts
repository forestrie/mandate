import { describe, expect, it } from 'vitest';
import {
	describePostRevokeActions,
	PostRevokeActionsError
} from '../src/describe-post-revoke-actions.js';
import { runDescribePostRevokeActionsCommand } from '../src/describe-post-revoke-command.js';

const WALLET_ID = 'wallet_post_revoke';
const LOG_ID = 'a'.repeat(64);
const ROOT_ADDR = '0x1111111111111111111111111111111111111111';

const KEY_DIRECTORY = {
	'user-log-wallet': {
		walletId: WALLET_ID,
		rootSignerAddress: ROOT_ADDR,
		logIds: [LOG_ID],
		requiresAuthorizationSignature: true
	},
	'other-wallet': {
		walletId: 'wallet_other',
		rootSignerAddress: '0x2222222222222222222222222222222222222222',
		logIds: ['b'.repeat(64)]
	}
};

describe('describePostRevokeActions', () => {
	it('AT-131-1: emits a pruned KEY_DIRECTORY without the revoked keyRef', () => {
		const actions = describePostRevokeActions({
			walletId: WALLET_ID,
			keyRef: 'user-log-wallet',
			keyDirectory: KEY_DIRECTORY
		});

		expect(actions.emitUpdatedKeyDirectory).not.toHaveProperty('user-log-wallet');
		expect(actions.emitUpdatedKeyDirectory).toHaveProperty('other-wallet');
		expect(actions.keyDirectoryEntryToRemove.walletId).toBe(WALLET_ID);
		expect(actions.operatorRootKeysAffected).toEqual([ROOT_ADDR]);
		expect(actions.expectedAgentBehavior).toContain('502');
	});

	it('AT-131-2: throws for an unknown keyRef', () => {
		expect(() =>
			describePostRevokeActions({
				walletId: WALLET_ID,
				keyRef: 'missing',
				keyDirectory: KEY_DIRECTORY
			})
		).toThrow(PostRevokeActionsError);
	});

	it('throws when keyRef maps to a different wallet', () => {
		expect(() =>
			describePostRevokeActions({
				walletId: WALLET_ID,
				keyRef: 'other-wallet',
				keyDirectory: KEY_DIRECTORY
			})
		).toThrow(PostRevokeActionsError);
	});

	it('AT-KS12: emits OPERATOR_ROOT_KEYS pruning hints for orphaned logIds', () => {
		const operatorRootKeys = {
			[LOG_ID]: {
				alg: 'KS256' as const,
				rootSignerAddress: ROOT_ADDR,
				kind: 'remote' as const,
				signerUrl: 'https://signer.example/v1/sign',
				keyRef: 'user-log-wallet'
			}
		};
		const actions = describePostRevokeActions({
			walletId: WALLET_ID,
			keyRef: 'user-log-wallet',
			keyDirectory: KEY_DIRECTORY,
			operatorRootKeys
		});
		expect(actions.logIdsOrphaned).toEqual([LOG_ID]);
		expect(actions.operatorRootKeysEntriesToRemove[LOG_ID]?.keyRef).toBe('user-log-wallet');
		expect(actions.emitUpdatedOperatorRootKeys).toEqual({});
		expect(actions.wranglerHints.join('\n')).toContain('OPERATOR_ROOT_KEYS');
	});
});

describe('runDescribePostRevokeActionsCommand', () => {
	it('AT-131-1: prints actions JSON including pruned directory', () => {
		const out: string[] = [];
		const code = runDescribePostRevokeActionsCommand(
			{
				walletId: WALLET_ID,
				keyRef: 'user-log-wallet',
				keyDirectoryJson: JSON.stringify(KEY_DIRECTORY)
			},
			{ stdout: (l) => out.push(l), stderr: () => {} }
		);
		expect(code).toBe(0);
		const parsed = JSON.parse(out.join('\n'));
		expect(parsed.emitUpdatedKeyDirectory).not.toHaveProperty('user-log-wallet');
		expect(parsed.emitUpdatedKeyDirectory).toHaveProperty('other-wallet');
	});

	it('AT-131-2: unknown keyRef exits 1', () => {
		const err: string[] = [];
		const code = runDescribePostRevokeActionsCommand(
			{
				walletId: WALLET_ID,
				keyRef: 'missing',
				keyDirectoryJson: JSON.stringify(KEY_DIRECTORY)
			},
			{ stdout: () => {}, stderr: (l) => err.push(l) }
		);
		expect(code).toBe(1);
		expect(err.join('\n')).toContain('missing');
	});

	it('--emit-updated-key-directory prints only the pruned directory', () => {
		const out: string[] = [];
		const code = runDescribePostRevokeActionsCommand(
			{
				walletId: WALLET_ID,
				keyRef: 'user-log-wallet',
				keyDirectoryJson: JSON.stringify(KEY_DIRECTORY),
				emitUpdatedKeyDirectory: true
			},
			{ stdout: (l) => out.push(l), stderr: () => {} }
		);
		expect(code).toBe(0);
		const parsed = JSON.parse(out.join('\n'));
		expect(parsed).not.toHaveProperty('user-log-wallet');
		expect(parsed).toHaveProperty('other-wallet');
	});

	it('missing KEY_DIRECTORY exits 1', () => {
		const err: string[] = [];
		const code = runDescribePostRevokeActionsCommand(
			{ walletId: WALLET_ID, keyRef: 'user-log-wallet' },
			{ stdout: () => {}, stderr: (l) => err.push(l) }
		);
		expect(code).toBe(1);
		expect(err.join('\n')).toContain('KEY_DIRECTORY');
	});
});
