import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { PrivyRestClient } from '@mandate/privy-admin';
import {
	runRevokeModeCCommand,
	type RevokeModeCCommandIo,
	type RevokeModeCCommandOptions
} from '../src/revoke-mode-c-command.js';

const WALLET_ID = 'wallet_cli_test';
const WALLET_ADDRESS = '0xabc0000000000000000000000000000000000abc';
const MANDATE_SIGNER = 'kq_mandate_signer_0000000001';
const TEST_PRIVY_API_BASE = 'https://privy.test';

function ownerAuthorizationKey(): string {
	const { privateKey } = generateKeyPairSync('ec', {
		namedCurve: 'P-256',
		privateKeyEncoding: { type: 'pkcs8', format: 'der' },
		publicKeyEncoding: { type: 'spki', format: 'der' }
	});
	return `wallet-auth:${Buffer.from(privateKey).toString('base64')}`;
}

interface MockState {
	getCount: number;
	patchCount: number;
	patchBody: unknown;
	patched: boolean;
	ownerless: boolean;
}

function makeClient(state: MockState): PrivyRestClient {
	const wallet = (signers: { signer_id: string }[]) => ({
		id: WALLET_ID,
		address: WALLET_ADDRESS,
		chain_type: 'ethereum',
		owner_id: state.ownerless ? null : 'kq_user_owner_0000000001',
		additional_signers: signers
	});
	const fetchImpl: typeof fetch = async (input, init) => {
		const url = String(input);
		const method = init?.method ?? 'GET';
		if (method === 'GET' && url.includes(`/v1/wallets/${WALLET_ID}`)) {
			state.getCount += 1;
			const signers = state.patched ? [] : [{ signer_id: MANDATE_SIGNER }];
			return new Response(JSON.stringify(wallet(signers)), { status: 200 });
		}
		if (method === 'PATCH' && url.includes(`/v1/wallets/${WALLET_ID}`)) {
			state.patchCount += 1;
			state.patchBody = JSON.parse(String(init?.body));
			state.patched = true;
			return new Response(JSON.stringify(wallet([])), { status: 200 });
		}
		return new Response(`unexpected ${method} ${url}`, { status: 500 });
	};
	return new PrivyRestClient({
		appId: 'app_test',
		appSecret: 'secret_test',
		apiBase: TEST_PRIVY_API_BASE,
		fetchImpl
	});
}

function makeIo(
	lines: { out: string[]; err: string[] },
	confirmReturns?: boolean
): RevokeModeCCommandIo {
	return {
		stdout: (l) => lines.out.push(l),
		stderr: (l) => lines.err.push(l),
		confirm: confirmReturns === undefined ? undefined : async () => confirmReturns
	};
}

function baseOptions(
	overrides: Partial<RevokeModeCCommandOptions> = {}
): RevokeModeCCommandOptions {
	return {
		walletId: WALLET_ID,
		ownerAuthorizationKey: ownerAuthorizationKey(),
		mandateSignerId: MANDATE_SIGNER,
		yes: false,
		clearAllAdditionalSigners: false,
		nonInteractive: true,
		...overrides
	};
}

function freshState(overrides: Partial<MockState> = {}): MockState {
	return {
		getCount: 0,
		patchCount: 0,
		patchBody: undefined,
		patched: false,
		ownerless: false,
		...overrides
	};
}

describe('runRevokeModeCCommand', () => {
	it('AT-132-1: --confirm-wallet-id mismatch exits 1 with no Privy call', async () => {
		const state = freshState();
		const lines = { out: [] as string[], err: [] as string[] };
		const code = await runRevokeModeCCommand(
			makeClient(state),
			baseOptions({
				confirmWalletId: 'wallet_other',
				yes: true,
				confirmWalletAddress: WALLET_ADDRESS
			}),
			makeIo(lines)
		);
		expect(code).toBe(1);
		expect(state.getCount).toBe(0);
		expect(state.patchCount).toBe(0);
		expect(lines.err.join('\n')).toContain('does not match');
	});

	it('AT-R02-1: missing mandateSignerId exits 1 with no Privy call', async () => {
		const state = freshState();
		const lines = { out: [] as string[], err: [] as string[] };
		const code = await runRevokeModeCCommand(
			makeClient(state),
			baseOptions({
				mandateSignerId: '',
				yes: true,
				confirmWalletId: WALLET_ID,
				confirmWalletAddress: WALLET_ADDRESS
			}),
			makeIo(lines)
		);
		expect(code).toBe(1);
		expect(state.getCount).toBe(0);
		expect(lines.err.join('\n')).toContain('mandate-signer-id');
	});

	it('AT-132-2: non-interactive without --yes exits 1 before PATCH', async () => {
		const state = freshState();
		const lines = { out: [] as string[], err: [] as string[] };
		const code = await runRevokeModeCCommand(
			makeClient(state),
			baseOptions({
				confirmWalletId: WALLET_ID,
				confirmWalletAddress: WALLET_ADDRESS,
				yes: false,
				nonInteractive: true
			}),
			makeIo(lines)
		);
		expect(code).toBe(1);
		expect(state.patchCount).toBe(0);
	});

	it('non-interactive without --confirm-wallet-id exits 1', async () => {
		const state = freshState();
		const lines = { out: [] as string[], err: [] as string[] };
		const code = await runRevokeModeCCommand(
			makeClient(state),
			baseOptions({ yes: true, confirmWalletAddress: WALLET_ADDRESS, nonInteractive: true }),
			makeIo(lines)
		);
		expect(code).toBe(1);
		expect(state.patchCount).toBe(0);
		expect(lines.err.join('\n')).toContain('--confirm-wallet-id');
	});

	it('non-interactive without --confirm-wallet-address exits 1', async () => {
		const state = freshState();
		const lines = { out: [] as string[], err: [] as string[] };
		const code = await runRevokeModeCCommand(
			makeClient(state),
			baseOptions({ yes: true, confirmWalletId: WALLET_ID, nonInteractive: true }),
			makeIo(lines)
		);
		expect(code).toBe(1);
		expect(state.patchCount).toBe(0);
		expect(lines.err.join('\n')).toContain('--confirm-wallet-address');
	});

	it('--confirm-wallet-address mismatch exits 1 before PATCH', async () => {
		const state = freshState();
		const lines = { out: [] as string[], err: [] as string[] };
		const code = await runRevokeModeCCommand(
			makeClient(state),
			baseOptions({
				yes: true,
				confirmWalletId: WALLET_ID,
				confirmWalletAddress: '0xdead'
			}),
			makeIo(lines)
		);
		expect(code).toBe(1);
		expect(state.patchCount).toBe(0);
		expect(lines.err.join('\n')).toContain('confirm-wallet-address');
	});

	it('AT-R03-1: non-interactive happy path PATCHes via revokeModeCWallet', async () => {
		const state = freshState();
		const lines = { out: [] as string[], err: [] as string[] };
		const key = ownerAuthorizationKey();
		const code = await runRevokeModeCCommand(
			makeClient(state),
			baseOptions({
				yes: true,
				confirmWalletId: WALLET_ID,
				confirmWalletAddress: WALLET_ADDRESS,
				ownerAuthorizationKey: key
			}),
			makeIo(lines)
		);
		expect(code).toBe(0);
		expect(state.patchCount).toBe(1);
		expect(state.patchBody).toEqual({ additional_signers: [] });
		expect(lines.out.join('\n')).toContain(WALLET_ADDRESS);
		expect(lines.out.join('\n')).toContain('"action": "targeted"');
		expect(lines.out.join('\n')).not.toContain(key);
		expect(lines.err.join('\n')).not.toContain(key);
	});

	it('interactive prompt declined exits 1 without PATCH', async () => {
		const state = freshState();
		const lines = { out: [] as string[], err: [] as string[] };
		const code = await runRevokeModeCCommand(
			makeClient(state),
			baseOptions({ nonInteractive: false, yes: false }),
			makeIo(lines, false)
		);
		expect(code).toBe(1);
		expect(state.patchCount).toBe(0);
	});

	it('AT-R01-1: clear-all on ownerless wallet exits via library error', async () => {
		const state = freshState({ ownerless: true });
		const lines = { out: [] as string[], err: [] as string[] };
		await expect(
			runRevokeModeCCommand(
				makeClient(state),
				baseOptions({
					yes: true,
					confirmWalletId: WALLET_ID,
					confirmWalletAddress: WALLET_ADDRESS,
					clearAllAdditionalSigners: true
				}),
				makeIo(lines)
			)
		).rejects.toThrow();
		expect(state.patchCount).toBe(0);
	});

	it('clear-all escape hatch routes through revokeModeCWallet', async () => {
		const state = freshState();
		const lines = { out: [] as string[], err: [] as string[] };
		const code = await runRevokeModeCCommand(
			makeClient(state),
			baseOptions({
				yes: true,
				confirmWalletId: WALLET_ID,
				confirmWalletAddress: WALLET_ADDRESS,
				clearAllAdditionalSigners: true
			}),
			makeIo(lines)
		);
		expect(code).toBe(0);
		expect(state.patchBody).toEqual({ additional_signers: [] });
		expect(lines.out.join('\n')).toContain('"action": "full-clear"');
		expect(lines.out.join('\n')).toContain('full clear');
	});
});
