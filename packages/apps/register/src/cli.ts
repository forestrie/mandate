#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import { provisionInstance } from './provision.js';
import {
	getOnboardRequestStatus,
	redeemOnboardToken,
	requestOnboardToken
} from './onboard-client.js';
import { onboardModeCWallet, PrivyRestClient } from '@mandate/privy-admin';
import { runRevokeModeCCommand } from './revoke-mode-c-command.js';
import type { DelegationMode } from './delegation-mode.js';

function usageOnboardRequest(): void {
	console.error(`Usage: mandate-register onboard request [options]

Options:
  --canopy-url       E2E_CANOPY_API_URL (required)
  --label            Instance label (required)
  --chain-id         EIP-155 chain id (required)
  --univocity-addr   40-hex Univocity contract (required)
  --contact-email    Operator contact email (required)
  --mandate-origin   Deployed mandate UI URL (optional)
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
  --mode                Delegation mode B or C (default: C)
  --univocity-addr      40-hex Univocity contract (E2E_CANOPY_UNIVOCITY_ADDR)
  --chain-id            EIP-155 chain id (E2E_CANOPY_CHAIN_ID)
  --forest-r            Optional dashed UUID for genesis R (generated if omitted)

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
  --yes                           Skip the interactive prompt (required in non-interactive/CI runs)
  --clear-all-additional-signers  Ops escape hatch: remove ALL additional signers (full clear)

Targeted revoke (default with --mandate-signer-id) preserves other authorized
signers; full clear requires --clear-all-additional-signers. In CI pass
--yes --confirm-wallet-id "$E2E_MODE_C_USER_PRIVY_WALLET_ID".
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

	const result = await requestOnboardToken({
		canopyBaseUrl: canopyBaseUrl!,
		label: label!,
		chainId: chainId!,
		univocityAddr: univocityAddr!,
		contactEmail: contactEmail!,
		mandateOrigin
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
	const mode = (modeRaw === 'B' ? 'B' : 'C') as DelegationMode;
	const univocityAddr = envOr(readFlag('--univocity-addr'), 'E2E_CANOPY_UNIVOCITY_ADDR');
	const chainId = envOr(readFlag('--chain-id'), 'E2E_CANOPY_CHAIN_ID');
	const forestR = readFlag('--forest-r') ?? process.env.MANDATE_FOREST_R;

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

	const base = {
		onboardToken: onboardToken!,
		canopyBaseUrl: canopyBaseUrl!,
		coordinatorBaseUrl: coordinatorBaseUrl!,
		agentWebhookUrl: agentWebhookUrl!,
		mode,
		univocityAddr: univocityAddr!,
		chainId: chainId!,
		forestR: forestR ?? randomUUID()
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
	const ownerAuthorizationKey =
		readFlag('--owner-auth-key') ?? process.env.E2E_MODE_C_PRIVY_OWNER_AUTH_KEY;
	const mandateSignerId = readFlag('--mandate-signer-id') ?? process.env.MANDATE_PRIVY_SIGNER_ID;
	const confirmWalletId = readFlag('--confirm-wallet-id');
	const yes = hasFlag('--yes');
	const clearAllAdditionalSigners = hasFlag('--clear-all-additional-signers');
	const privy = requirePrivyClientConfig();

	if (!walletId || !ownerAuthorizationKey) {
		usageRevokeModeC();
	}

	const client = new PrivyRestClient(privy);
	const nonInteractive = process.env.CI === 'true' || !process.stdout.isTTY;

	const exitCode = await runRevokeModeCCommand(
		client,
		{
			walletId: walletId!,
			ownerAuthorizationKey: ownerAuthorizationKey!,
			mandateSignerId: mandateSignerId ?? undefined,
			confirmWalletId,
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
	process.exit(sub ? 1 : 0);
}

main().catch((error: unknown) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
});
