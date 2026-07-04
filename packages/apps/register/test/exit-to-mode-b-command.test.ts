import { describe, expect, it } from 'vitest';
import type { OperatorRootKeysMap } from '../src/describe-post-revoke-actions.js';
import {
	computeExitToModeBOperatorRootKeys,
	runExitToModeBCommand,
	USER_SIGNER_BEARER_ENV_KEY,
	type ExitToModeBCommandIo,
	type ExitToModeBCommandOptions
} from '../src/exit-to-mode-b-command.js';

const LOG_ID = 'a1b2c3d4a1b2c3d4a1b2c3d4a1b2c3d4a1b2c3d4a1b2c3d4a1b2c3d4a1b2c3d4';
const ROOT_ADDRESS = '0xabc0000000000000000000000000000000000abc';
const MANDATE_SIGNER_URL = 'https://mandate-signer.example.workers.dev/v1/sign';
const USER_SIGNER_URL = 'https://mandate-reference-user-signer.example.workers.dev/v1/sign';
const USER_SIGNER_BEARER = 'user-signer-bearer-secret';

function modeCAgentKeys(): OperatorRootKeysMap {
	return {
		[LOG_ID]: {
			alg: 'KS256',
			rootSignerAddress: ROOT_ADDRESS,
			kind: 'remote',
			signerUrl: MANDATE_SIGNER_URL,
			keyRef: 'user-log-wallet'
		}
	};
}

interface AppliedSecret {
	name: string;
	value: string;
}

function makeIo(
	lines: { out: string[]; err: string[] },
	applied: AppliedSecret[],
	opts: { confirmReturns?: boolean; failApply?: boolean } = {}
): ExitToModeBCommandIo {
	return {
		stdout: (l) => lines.out.push(l),
		stderr: (l) => lines.err.push(l),
		confirm: opts.confirmReturns === undefined ? undefined : async () => opts.confirmReturns!,
		applyAgentSecret: async (name, value) => {
			if (opts.failApply) throw new Error('wrangler put failed');
			applied.push({ name, value });
		}
	};
}

function baseOptions(
	overrides: Partial<ExitToModeBCommandOptions> = {}
): ExitToModeBCommandOptions {
	return {
		logId: LOG_ID,
		agentName: 'mandate-agent',
		userSignerUrl: USER_SIGNER_URL,
		userSignerBearer: USER_SIGNER_BEARER,
		operatorRootKeys: modeCAgentKeys(),
		yes: true,
		nonInteractive: true,
		...overrides
	};
}

describe('computeExitToModeBOperatorRootKeys', () => {
	it('AT-311-1: repoints signerUrl but preserves rootSignerAddress (publicRoot unchanged)', () => {
		const { updated, previous, next } = computeExitToModeBOperatorRootKeys(modeCAgentKeys(), {
			logId: LOG_ID,
			userSignerUrl: USER_SIGNER_URL,
			keyRef: 'user-remote'
		});
		expect(previous.signerUrl).toBe(MANDATE_SIGNER_URL);
		expect(next.rootSignerAddress).toBe(ROOT_ADDRESS);
		expect(next.signerUrl).toBe(USER_SIGNER_URL);
		expect(next.kind).toBe('remote');
		expect(next.keyRef).toBe('user-remote');
		expect(next.bearerEnvKey).toBe(USER_SIGNER_BEARER_ENV_KEY);
		expect(updated[LOG_ID]).toEqual(next);
	});

	it('AT-311-2: matches logId case-insensitively', () => {
		const { next } = computeExitToModeBOperatorRootKeys(modeCAgentKeys(), {
			logId: LOG_ID.toUpperCase(),
			userSignerUrl: USER_SIGNER_URL,
			keyRef: 'user-remote'
		});
		expect(next.signerUrl).toBe(USER_SIGNER_URL);
	});

	it('does not mutate other logId entries', () => {
		const other = 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
		const map = { ...modeCAgentKeys() };
		map[other] = {
			alg: 'KS256',
			rootSignerAddress: '0xdead',
			kind: 'remote',
			signerUrl: 'https://other.example/v1/sign',
			keyRef: 'other'
		};
		const { updated } = computeExitToModeBOperatorRootKeys(map, {
			logId: LOG_ID,
			userSignerUrl: USER_SIGNER_URL,
			keyRef: 'user-remote'
		});
		expect(updated[other]).toEqual(map[other]);
	});

	it('throws when logId absent from OPERATOR_ROOT_KEYS', () => {
		expect(() =>
			computeExitToModeBOperatorRootKeys(
				{},
				{ logId: LOG_ID, userSignerUrl: USER_SIGNER_URL, keyRef: 'user-remote' }
			)
		).toThrow(/not found/i);
	});
});

describe('runExitToModeBCommand', () => {
	it('AT-311-3: happy path applies OPERATOR_ROOT_KEYS and USER_SIGNER_BEARER to the agent', async () => {
		const lines = { out: [] as string[], err: [] as string[] };
		const applied: AppliedSecret[] = [];
		const code = await runExitToModeBCommand(baseOptions(), makeIo(lines, applied));
		expect(code).toBe(0);

		const rootKeysPut = applied.find((s) => s.name === 'OPERATOR_ROOT_KEYS');
		expect(rootKeysPut).toBeDefined();
		const bearerPut = applied.find((s) => s.name === USER_SIGNER_BEARER_ENV_KEY);
		expect(bearerPut?.value).toBe(USER_SIGNER_BEARER);

		const putMap = JSON.parse(rootKeysPut!.value) as OperatorRootKeysMap;
		expect(putMap[LOG_ID]?.signerUrl).toBe(USER_SIGNER_URL);
		expect(putMap[LOG_ID]?.rootSignerAddress).toBe(ROOT_ADDRESS);
		// Bearer secret value must never leak to logs.
		expect(lines.out.join('\n')).not.toContain(USER_SIGNER_BEARER);
		expect(lines.err.join('\n')).not.toContain(USER_SIGNER_BEARER);
	});

	it('AT-311-4: unknown logId exits 1 with no wrangler mutation', async () => {
		const lines = { out: [] as string[], err: [] as string[] };
		const applied: AppliedSecret[] = [];
		const code = await runExitToModeBCommand(
			baseOptions({ operatorRootKeys: {} }),
			makeIo(lines, applied)
		);
		expect(code).toBe(1);
		expect(applied).toHaveLength(0);
	});

	it('rejects a non-https user signer url before any mutation', async () => {
		const lines = { out: [] as string[], err: [] as string[] };
		const applied: AppliedSecret[] = [];
		const code = await runExitToModeBCommand(
			baseOptions({ userSignerUrl: 'http://insecure.example/v1/sign' }),
			makeIo(lines, applied)
		);
		expect(code).toBe(1);
		expect(applied).toHaveLength(0);
		expect(lines.err.join('\n')).toMatch(/https/i);
	});

	it('non-interactive without --yes exits 1 before any mutation', async () => {
		const lines = { out: [] as string[], err: [] as string[] };
		const applied: AppliedSecret[] = [];
		const code = await runExitToModeBCommand(
			baseOptions({ yes: false, nonInteractive: true }),
			makeIo(lines, applied)
		);
		expect(code).toBe(1);
		expect(applied).toHaveLength(0);
		expect(lines.err.join('\n')).toContain('--yes');
	});

	it('interactive prompt declined exits 1 without mutation', async () => {
		const lines = { out: [] as string[], err: [] as string[] };
		const applied: AppliedSecret[] = [];
		const code = await runExitToModeBCommand(
			baseOptions({ yes: false, nonInteractive: false }),
			makeIo(lines, applied, { confirmReturns: false })
		);
		expect(code).toBe(1);
		expect(applied).toHaveLength(0);
	});
});
