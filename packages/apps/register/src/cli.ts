#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { provisionInstance } from './provision.js';
import {
	getOnboardRequestStatus,
	redeemOnboardToken,
	requestOnboardToken
} from './onboard-client.js';
import { buildOnboardAttestationKs256Remote } from './onboard-attestation.js';
import { onboardModeCWallet, PrivyRestClient } from '@mandate/privy-admin';
import { runRevokeModeCCommand } from './revoke-mode-c-command.js';
import { runDescribePostRevokeActionsCommand } from './describe-post-revoke-command.js';
import { runExitToModeBCommand } from './exit-to-mode-b-command.js';
import type { OperatorRootKeysMap } from './describe-post-revoke-actions.js';
import type { DelegationMode } from './delegation-mode.js';
import { parseUnivocityVariant } from './univocity-genesis-variant.js';

function usageOnboardRequest(): void {
	console.error(`Usage: mandate-register onboard request [options]

Options:
  --canopy-url       E2E_CANOPY_API_URL (required)
  --label            Instance label (required)
  --chain-id         EIP-155 chain id (required)
  --univocity-addr   40-hex Univocity contract (required)
  --contact-email    Operator contact email (required)
  --mandate-origin   Deployed mandate UI URL (optional)

Bootstrap-key attestation (ADR-0059 D8 — required where canopy arms
ONBOARD_REQUIRE_KEY_ATTESTATION; signed by the remote mandate signer):
  --root-address     Bootstrap wallet address the signer recovery-checks (0x…)
  --log-id           32-hex log id the signer KEY_DIRECTORY authorises
  --signer-url       mandate-signer /v1/sign URL (MANDATE_SIGNER_URL)
  --key-ref          KEY_DIRECTORY keyRef (default: user-log-wallet)
  --attest-aud       aud claim (default: the canopy URL origin)
  MANDATE_SIGNER_TOKEN env: bearer for the signer call (required to attest)

Pass --root-address and --log-id together to attest; omit both to post an
unattested request (rejected wherever the canopy policy is armed).
`);
	process.exit(1);
}

function usageOnboardRedeem(): void {
	console.error(`Usage: mandate-register onboard redeem [options]

Options:
  --canopy-url       E2E_CANOPY_API_URL (required)
  --request-id       Onboard request id from request step (required)
  --redeem-code      Redeem code from request step (required)
`);
	process.exit(1);
}

function usageOnboardStatus(): void {
	console.error(`Usage: mandate-register onboard status [options]

Options:
  --canopy-url       E2E_CANOPY_API_URL (required)
  --request-id       Onboard request id (required)
`);
	process.exit(1);
}

function usageProvision(): void {
	console.error(`Usage: mandate-register provision [options]

Options (env fallbacks in parentheses):
  --onboard-token       E2E_CANOPY_PAYMENTS_ONBOARD_TOKEN (required)
  --canopy-url          E2E_CANOPY_API_URL (required)
  --coordinator-url     E2E_DELEGATION_COORDINATOR_URL (required)
  --webhook-url         E2E_MANDATE_AGENT_WEBHOOK_URL (required)
  --mode                Delegation mode B, C or D (default: C)
  --univocity-addr      40-hex Univocity contract (E2E_CANOPY_UNIVOCITY_ADDR)
  --chain-id            EIP-155 chain id (E2E_CANOPY_CHAIN_ID)
  --forest-r            Optional dashed UUID for genesis R (generated if omitted)
  --univocity-variant   imutable (default) or uups-counterfactual (path C)
  --univocity-deployer  CREATE3 deployer 0x… (required with uups-counterfactual)

Mode C (Privy):
  --wallet-id           E2E_MODE_C_USER_PRIVY_WALLET_ID
  --mandate-signer-id   MANDATE_PRIVY_SIGNER_ID
  --owner-auth-key      E2E_MODE_C_PRIVY_OWNER_AUTH_KEY
  --key-ref             KEY_DIRECTORY keyRef (default: user-log-wallet)
  --signer-url          MANDATE_SIGNER_URL
  --policy-id           Existing Privy policy id (optional)

Mode B (user remote signer — descriptor only, FOR-111):
  --root-address        User KS256 root address (0x…)
  --user-signer-url     User signer POST /v1/sign URL
  --key-ref             keyRef for OPERATOR_ROOT_KEYS

Safe 1x1 (Mode D — interactive root, ADR-0005 addendum):
  --safe-address        1-of-1 Safe contract address (0x…); the root signs in
                        the console — no signer service, no custody client
`);
	process.exit(1);
}

function usageOnboardModeC(): void {
	console.error(`Usage: mandate-register privy onboard-mode-c [options]

Options (env fallbacks in parentheses):
  --wallet-id           Privy user-owned wallet id (E2E_MODE_C_USER_PRIVY_WALLET_ID)
  --mandate-signer-id   Mandate key quorum id (MANDATE_PRIVY_SIGNER_ID)
  --owner-auth-key      Owner authorization key for wallet PATCH (E2E_MODE_C_PRIVY_OWNER_AUTH_KEY)
  --key-ref             KEY_DIRECTORY keyRef (default: user-log-wallet)
  --log-id              32-hex log id (required)
  --signer-url          mandate-signer /v1/sign URL (MANDATE_SIGNER_URL)
  --policy-id           Existing policy id (optional; creates policy if omitted)
`);
	process.exit(1);
}

function usageRevokeModeC(): void {
	console.error(`Usage: mandate-register privy revoke-mode-c [options]

Destructive: removes mandate as an additional signer on a user-owned Privy
wallet (custody kill switch, ARC-0022 I3). Prints a pre-revoke summary
(wallet id, address, signer count, action) before any change.

Options (env fallbacks in parentheses):
  --wallet-id                     Privy user-owned wallet id (E2E_MODE_C_USER_PRIVY_WALLET_ID)
  --owner-auth-key                Owner authorization key for wallet PATCH (E2E_MODE_C_PRIVY_OWNER_AUTH_KEY)
  --mandate-signer-id             Mandate key quorum id; enables targeted revoke (MANDATE_PRIVY_SIGNER_ID)
  --confirm-wallet-id             Must equal --wallet-id; required in non-interactive/CI runs
  --confirm-wallet-address        Must equal Privy wallet address; required in non-interactive/CI
  --yes                           Skip the interactive prompt (required in non-interactive/CI runs)
  --clear-all-additional-signers  Ops escape hatch: remove ALL additional signers (full clear)

Targeted revoke (default) preserves other authorized signers; full clear requires
--clear-all-additional-signers. --mandate-signer-id is always required.
Prefer E2E_MODE_C_PRIVY_OWNER_AUTH_KEY env over --owner-auth-key (argv is visible in ps).
In CI pass --yes --confirm-wallet-id and --confirm-wallet-address from the pre-revoke summary.
`);
	process.exit(1);
}

function usageDescribePostRevoke(): void {
	console.error(`Usage: mandate-register privy describe-post-revoke-actions [options]

Emit the operator checklist for retiring a revoked Mode C wallet's signer
secrets. Read-only: never mutates Cloudflare or Doppler secrets.

Options (env fallbacks in parentheses):
  --wallet-id                   Revoked Privy wallet id (E2E_MODE_C_USER_PRIVY_WALLET_ID)
  --key-ref                     KEY_DIRECTORY keyRef to retire (default: user-log-wallet)
  --key-directory-json          KEY_DIRECTORY JSON (KEY_DIRECTORY env)
  --operator-root-keys-json     OPERATOR_ROOT_KEYS JSON (OPERATOR_ROOT_KEYS env)
  --emit-updated-key-directory  Print only the pruned KEY_DIRECTORY for piping
`);
	process.exit(1);
}

function usageExitToModeB(): void {
	console.error(`Usage: mandate-register privy exit-to-mode-b [options]

ADR-0005 exit step 3 (Mode C→B): repoint the deployed agent's OPERATOR_ROOT_KEYS
entry for a log from the mandate-operated signer to a user-operated signer, and
set the agent's USER_SIGNER_BEARER. Preserves rootSignerAddress (public root is
unchanged). Run \`privy revoke-mode-c\` first (exit step 2). Mutates Cloudflare
Worker secrets via wrangler; prints a pre-exit summary before any change.

Options (env fallbacks in parentheses):
  --log-id                   32-hex log id to repoint (required)
  --signer-url               User signer …/v1/sign URL (E2E_USER_SIGNER_URL)
  --user-signer-bearer       Bearer for the agent→user-signer call (USER_SIGNER_BEARER)
  --agent-name               wrangler --name target (default: mandate-agent)
  --operator-root-keys-json  Current OPERATOR_ROOT_KEYS JSON (OPERATOR_ROOT_KEYS)
  --key-ref                  keyRef for the repointed entry (default: user-remote)
  --yes                      Skip the interactive prompt (required in non-interactive/CI)

Prefer USER_SIGNER_BEARER env over --user-signer-bearer (argv is visible in ps).
On success prints a JSON object with the redacted OPERATOR_ROOT_KEYS and a fresh
top-level configNonce; poll the agent's GET /ops/root-key-config until it serves
that nonce with kind:"remote" before treating the repoint as live (FOR-311 S1).
`);
	process.exit(1);
}

function readFlag(name: string): string | undefined {
	const index = process.argv.indexOf(name);
	if (index === -1 || index + 1 >= process.argv.length) return undefined;
	return process.argv[index + 1];
}

function hasFlag(name: string): boolean {
	return process.argv.includes(name);
}

async function promptYesNo(question: string): Promise<boolean> {
	const { createInterface } = await import('node:readline/promises');
	const rl = createInterface({ input: process.stdin, output: process.stdout });
	try {
		const answer = (await rl.question(question)).trim().toLowerCase();
		return answer === 'y' || answer === 'yes';
	} finally {
		rl.close();
	}
}

function envOr(flag: string | undefined, ...names: string[]): string | undefined {
	if (flag) return flag;
	for (const name of names) {
		const value = process.env[name]?.trim();
		if (value) return value;
	}
	return undefined;
}

function requireOperationalEnv(name: string): string {
	const value = process.env[name]?.trim();
	if (!value) {
		console.error(`missing required env: ${name}`);
		process.exit(1);
	}
	return value;
}

function requirePrivyClientConfig(): {
	appId: string;
	appSecret: string;
	apiBase: string;
} {
	return {
		appId: requireOperationalEnv('MANDATE_PRIVY_APP_ID'),
		appSecret: requireOperationalEnv('MANDATE_PRIVY_APP_SECRET'),
		apiBase: requireOperationalEnv('MANDATE_PRIVY_API_BASE')
	};
}

/**
 * Build the D8 bootstrap-key attestation for `onboard request` via the remote
 * mandate signer (the bootstrap key never leaves custody). Attestation is
 * armed by --root-address/--log-id (with --signer-url or MANDATE_SIGNER_URL);
 * naming any one of the three arms it, so a partial flag set fails loudly
 * instead of silently posting unattested.
 */
async function buildOnboardRequestAttestation(args: {
	canopyBaseUrl: string;
	chainId: string;
	univocityAddr: string;
}): Promise<Uint8Array | undefined> {
	const rootSignerAddress = readFlag('--root-address');
	const logIdHex32 = readFlag('--log-id');
	const signerUrlFlag = readFlag('--signer-url');
	if (!rootSignerAddress && !logIdHex32 && !signerUrlFlag) {
		return undefined;
	}

	const signerUrl = envOr(signerUrlFlag, 'MANDATE_SIGNER_URL');
	if (!rootSignerAddress || !logIdHex32 || !signerUrl) {
		console.error(
			'attested onboard request needs --root-address, --log-id and a signer URL ' +
				'(--signer-url or MANDATE_SIGNER_URL)'
		);
		usageOnboardRequest();
	}
	const bearerToken = requireOperationalEnv('MANDATE_SIGNER_TOKEN');

	return buildOnboardAttestationKs256Remote(
		{
			signerUrl: signerUrl!,
			bearerToken,
			keyRef: readFlag('--key-ref') ?? 'user-log-wallet',
			rootSignerAddress: rootSignerAddress!,
			logIdHex32: logIdHex32!
		},
		{
			chainId: args.chainId,
			univocityAddr: args.univocityAddr.replace(/^0x/i, '').toLowerCase(),
			aud: readFlag('--attest-aud') ?? new URL(args.canopyBaseUrl).origin,
			nowSec: Math.floor(Date.now() / 1000)
		}
	);
}

async function runOnboardRequest(): Promise<void> {
	const canopyBaseUrl = envOr(readFlag('--canopy-url'), 'E2E_CANOPY_API_URL');
	const label = readFlag('--label');
	const chainId = readFlag('--chain-id');
	const univocityAddr = readFlag('--univocity-addr');
	const contactEmail = readFlag('--contact-email');
	const mandateOrigin = readFlag('--mandate-origin');

	if (!canopyBaseUrl || !label || !chainId || !univocityAddr || !contactEmail) {
		usageOnboardRequest();
	}

	const attestation = await buildOnboardRequestAttestation({
		canopyBaseUrl: canopyBaseUrl!,
		chainId: chainId!,
		univocityAddr: univocityAddr!
	});

	const result = await requestOnboardToken({
		canopyBaseUrl: canopyBaseUrl!,
		label: label!,
		chainId: chainId!,
		univocityAddr: univocityAddr!,
		contactEmail: contactEmail!,
		mandateOrigin,
		attestation
	});
	console.log(JSON.stringify(result, null, 2));
}

async function runOnboardRedeem(): Promise<void> {
	const canopyBaseUrl = envOr(readFlag('--canopy-url'), 'E2E_CANOPY_API_URL');
	const requestId = readFlag('--request-id');
	const redeemCode = readFlag('--redeem-code');

	if (!canopyBaseUrl || !requestId || !redeemCode) {
		usageOnboardRedeem();
	}

	const token = await redeemOnboardToken({
		canopyBaseUrl: canopyBaseUrl!,
		requestId: requestId!,
		redeemCode: redeemCode!
	});
	console.log(JSON.stringify({ token, requestId }, null, 2));
}

async function runOnboardStatus(): Promise<void> {
	const canopyBaseUrl = envOr(readFlag('--canopy-url'), 'E2E_CANOPY_API_URL');
	const requestId = readFlag('--request-id');

	if (!canopyBaseUrl || !requestId) {
		usageOnboardStatus();
	}

	const status = await getOnboardRequestStatus(canopyBaseUrl!, requestId!);
	console.log(JSON.stringify(status, null, 2));
}

async function runProvision(): Promise<void> {
	const onboardToken = envOr(readFlag('--onboard-token'), 'E2E_CANOPY_PAYMENTS_ONBOARD_TOKEN');
	const canopyBaseUrl = envOr(readFlag('--canopy-url'), 'E2E_CANOPY_API_URL');
	const coordinatorBaseUrl = envOr(readFlag('--coordinator-url'), 'E2E_DELEGATION_COORDINATOR_URL');
	const agentWebhookUrl = envOr(readFlag('--webhook-url'), 'E2E_MANDATE_AGENT_WEBHOOK_URL');
	const modeRaw = (readFlag('--mode') ?? process.env.MANDATE_DELEGATION_MODE ?? 'C').toUpperCase();
	const mode = (modeRaw === 'B' || modeRaw === 'D' ? modeRaw : 'C') as DelegationMode;
	const univocityAddr = envOr(readFlag('--univocity-addr'), 'E2E_CANOPY_UNIVOCITY_ADDR');
	const chainId = envOr(readFlag('--chain-id'), 'E2E_CANOPY_CHAIN_ID');
	const forestR = readFlag('--forest-r') ?? process.env.MANDATE_FOREST_R;
	const univocityVariant = parseUnivocityVariant(readFlag('--univocity-variant'));
	const univocityDeployer = readFlag('--univocity-deployer');

	if (
		!onboardToken ||
		!canopyBaseUrl ||
		!coordinatorBaseUrl ||
		!agentWebhookUrl ||
		!univocityAddr ||
		!chainId
	) {
		usageProvision();
	}

	if (univocityVariant === 'uups-counterfactual' && !univocityDeployer) {
		console.error('uups-counterfactual provisioning requires --univocity-deployer');
		usageProvision();
	}

	const base = {
		onboardToken: onboardToken!,
		canopyBaseUrl: canopyBaseUrl!,
		coordinatorBaseUrl: coordinatorBaseUrl!,
		agentWebhookUrl: agentWebhookUrl!,
		mode,
		univocityAddr: univocityAddr!,
		chainId: chainId!,
		forestR: forestR ?? randomUUID(),
		...(univocityVariant ? { univocityVariant } : {}),
		...(univocityDeployer ? { univocityDeployer } : {})
	};

	if (mode === 'C') {
		const walletId = envOr(readFlag('--wallet-id'), 'E2E_MODE_C_USER_PRIVY_WALLET_ID');
		const mandateSignerId = envOr(readFlag('--mandate-signer-id'), 'MANDATE_PRIVY_SIGNER_ID');
		const ownerAuthorizationKey = envOr(
			readFlag('--owner-auth-key'),
			'E2E_MODE_C_PRIVY_OWNER_AUTH_KEY'
		);
		const signerUrl = envOr(readFlag('--signer-url'), 'MANDATE_SIGNER_URL');
		const privy = requirePrivyClientConfig();
		if (!walletId || !mandateSignerId || !ownerAuthorizationKey || !signerUrl) {
			usageProvision();
		}
		const output = await provisionInstance({
			...base,
			modeC: {
				...privy,
				walletId: walletId!,
				mandateSignerId: mandateSignerId!,
				ownerAuthorizationKey: ownerAuthorizationKey!,
				signerUrl: signerUrl!,
				keyRef: readFlag('--key-ref') ?? 'user-log-wallet',
				policyId: readFlag('--policy-id')
			}
		});
		console.log(JSON.stringify(output, null, 2));
		return;
	}

	if (mode === 'D') {
		const safeAddress = readFlag('--safe-address');
		if (!safeAddress) {
			usageProvision();
		}
		const output = await provisionInstance({
			...base,
			modeD: { safeAddress: safeAddress! }
		});
		console.log(JSON.stringify(output, null, 2));
		return;
	}

	const rootSignerAddress = readFlag('--root-address');
	const userSignerUrl = readFlag('--user-signer-url');
	const keyRef = readFlag('--key-ref');
	if (!rootSignerAddress || !userSignerUrl || !keyRef) {
		usageProvision();
	}
	const output = await provisionInstance({
		...base,
		modeB: {
			rootSignerAddress: rootSignerAddress!,
			userSignerUrl: userSignerUrl!,
			keyRef: keyRef!
		}
	});
	console.log(JSON.stringify(output, null, 2));
}

async function runOnboardModeC(): Promise<void> {
	const walletId = readFlag('--wallet-id') ?? process.env.E2E_MODE_C_USER_PRIVY_WALLET_ID;
	const mandateSignerId = readFlag('--mandate-signer-id') ?? process.env.MANDATE_PRIVY_SIGNER_ID;
	const ownerAuthorizationKey =
		readFlag('--owner-auth-key') ?? process.env.E2E_MODE_C_PRIVY_OWNER_AUTH_KEY;
	const keyRef = readFlag('--key-ref') ?? 'user-log-wallet';
	const logId = readFlag('--log-id');
	const signerUrl = readFlag('--signer-url') ?? process.env.MANDATE_SIGNER_URL;
	const policyId = readFlag('--policy-id');
	const privy = requirePrivyClientConfig();

	if (!walletId || !mandateSignerId || !ownerAuthorizationKey || !logId || !signerUrl) {
		usageOnboardModeC();
	}

	const client = new PrivyRestClient(privy);

	const output = await onboardModeCWallet(client, {
		walletId: walletId!,
		mandateSignerId: mandateSignerId!,
		keyRef,
		logId: logId!,
		signerUrl: signerUrl!,
		ownerAuthorizationKey: ownerAuthorizationKey!,
		policyId
	});

	console.log(JSON.stringify(output, null, 2));
}

async function runRevokeModeC(): Promise<void> {
	const walletId = readFlag('--wallet-id') ?? process.env.E2E_MODE_C_USER_PRIVY_WALLET_ID;
	const ownerAuthFromArgv = readFlag('--owner-auth-key');
	const ownerAuthorizationKey = ownerAuthFromArgv ?? process.env.E2E_MODE_C_PRIVY_OWNER_AUTH_KEY;
	const mandateSignerId = readFlag('--mandate-signer-id') ?? process.env.MANDATE_PRIVY_SIGNER_ID;
	const confirmWalletId = readFlag('--confirm-wallet-id');
	const confirmWalletAddress = readFlag('--confirm-wallet-address');
	const yes = hasFlag('--yes');
	const clearAllAdditionalSigners = hasFlag('--clear-all-additional-signers');
	const privy = requirePrivyClientConfig();

	if (!walletId || !ownerAuthorizationKey) {
		usageRevokeModeC();
	}
	if (!mandateSignerId) {
		console.error('Missing --mandate-signer-id / MANDATE_PRIVY_SIGNER_ID');
		usageRevokeModeC();
	}
	if (ownerAuthFromArgv !== undefined) {
		console.error(
			'warning: --owner-auth-key on the command line is visible in process listings; ' +
				'prefer E2E_MODE_C_PRIVY_OWNER_AUTH_KEY from the environment'
		);
	}

	const client = new PrivyRestClient(privy);
	const nonInteractive = process.env.CI === 'true' || !process.stdout.isTTY;

	const exitCode = await runRevokeModeCCommand(
		client,
		{
			walletId: walletId!,
			ownerAuthorizationKey: ownerAuthorizationKey!,
			mandateSignerId: mandateSignerId!,
			confirmWalletId,
			confirmWalletAddress,
			yes,
			clearAllAdditionalSigners,
			nonInteractive
		},
		{
			stdout: (line) => console.log(line),
			stderr: (line) => console.error(line),
			confirm: promptYesNo
		}
	);

	if (exitCode !== 0) {
		process.exit(exitCode);
	}
}

async function runDescribePostRevokeActions(): Promise<void> {
	const walletId = readFlag('--wallet-id') ?? process.env.E2E_MODE_C_USER_PRIVY_WALLET_ID;
	const keyRef = readFlag('--key-ref') ?? 'user-log-wallet';
	const keyDirectoryJson = readFlag('--key-directory-json') ?? process.env.KEY_DIRECTORY;
	const operatorRootKeysJson =
		readFlag('--operator-root-keys-json') ?? process.env.OPERATOR_ROOT_KEYS;
	const emitUpdatedKeyDirectory = hasFlag('--emit-updated-key-directory');

	if (!walletId) {
		usageDescribePostRevoke();
	}

	const exitCode = runDescribePostRevokeActionsCommand(
		{
			walletId: walletId!,
			keyRef,
			keyDirectoryJson,
			operatorRootKeysJson,
			emitUpdatedKeyDirectory
		},
		{
			stdout: (line) => console.log(line),
			stderr: (line) => console.error(line)
		}
	);

	if (exitCode !== 0) {
		process.exit(exitCode);
	}
}

/** Apply a Cloudflare Worker secret via `wrangler secret put`, value piped on stdin. */
function wranglerSecretPut(agentName: string, name: string, value: string): Promise<void> {
	return new Promise((resolvePromise, reject) => {
		const child = spawn('wrangler', ['secret', 'put', name, '--name', agentName], {
			stdio: ['pipe', 'inherit', 'inherit']
		});
		child.on('error', reject);
		child.on('close', (code) => {
			if (code === 0) resolvePromise();
			else reject(new Error(`wrangler secret put ${name} exited with code ${code ?? 1}`));
		});
		child.stdin.write(value);
		child.stdin.end();
	});
}

async function runExitToModeB(): Promise<void> {
	const logId = readFlag('--log-id');
	const userSignerUrl = envOr(readFlag('--signer-url'), 'E2E_USER_SIGNER_URL');
	const bearerFromArgv = readFlag('--user-signer-bearer');
	const userSignerBearer = bearerFromArgv ?? process.env.USER_SIGNER_BEARER?.trim();
	const agentName = readFlag('--agent-name') ?? 'mandate-agent';
	const operatorRootKeysJson =
		readFlag('--operator-root-keys-json') ?? process.env.OPERATOR_ROOT_KEYS;
	const keyRef = readFlag('--key-ref');
	const yes = hasFlag('--yes');

	if (!logId || !userSignerUrl || !userSignerBearer || !operatorRootKeysJson) {
		usageExitToModeB();
	}
	if (bearerFromArgv !== undefined) {
		console.error(
			'warning: --user-signer-bearer on the command line is visible in process listings; ' +
				'prefer USER_SIGNER_BEARER from the environment'
		);
	}

	let operatorRootKeys: OperatorRootKeysMap;
	try {
		operatorRootKeys = JSON.parse(operatorRootKeysJson!) as OperatorRootKeysMap;
	} catch {
		console.error('failed to parse OPERATOR_ROOT_KEYS / --operator-root-keys-json as JSON');
		process.exit(1);
	}

	const nonInteractive = process.env.CI === 'true' || !process.stdout.isTTY;

	const exitCode = await runExitToModeBCommand(
		{
			logId: logId!,
			agentName,
			userSignerUrl: userSignerUrl!,
			userSignerBearer: userSignerBearer!,
			operatorRootKeys,
			keyRef,
			yes,
			nonInteractive
		},
		{
			stdout: (line) => console.log(line),
			stderr: (line) => console.error(line),
			confirm: promptYesNo,
			applyAgentSecret: (name, value) => wranglerSecretPut(agentName, name, value)
		}
	);

	if (exitCode !== 0) {
		process.exit(exitCode);
	}
}

async function main(): Promise<void> {
	const sub = process.argv[2];
	const cmd = process.argv[3];

	if (sub === 'onboard' && cmd === 'request') {
		await runOnboardRequest();
		return;
	}

	if (sub === 'onboard' && cmd === 'redeem') {
		await runOnboardRedeem();
		return;
	}

	if (sub === 'onboard' && cmd === 'status') {
		await runOnboardStatus();
		return;
	}

	if (sub === 'provision') {
		await runProvision();
		return;
	}

	if (sub === 'privy' && cmd === 'onboard-mode-c') {
		await runOnboardModeC();
		return;
	}

	if (sub === 'privy' && cmd === 'revoke-mode-c') {
		await runRevokeModeC();
		return;
	}

	if (sub === 'privy' && cmd === 'describe-post-revoke-actions') {
		await runDescribePostRevokeActions();
		return;
	}

	if (sub === 'privy' && cmd === 'exit-to-mode-b') {
		await runExitToModeB();
		return;
	}

	console.log('mandate-register: Univocity instance provisioning (FOR-100)');
	console.log('  subcommands:');
	console.log('    onboard request          Self-service onboard token request (FOR-173)');
	console.log('    onboard status           Poll onboard request status');
	console.log('    onboard redeem           Redeem approved request for onboard token');
	console.log('    provision                Full genesis + descriptor emission');
	console.log('    privy onboard-mode-c   Mode C Privy wallet onboarding only (FOR-112)');
	console.log(
		'    privy revoke-mode-c    Mode C kill switch — remove additional signers (FOR-114)'
	);
	console.log(
		'    privy describe-post-revoke-actions  Post-revoke KEY_DIRECTORY checklist (FOR-131)'
	);
	console.log('    privy exit-to-mode-b   Repoint agent signer to user-operated signer (FOR-311)');
	process.exit(sub ? 1 : 0);
}

main().catch((error: unknown) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
});
