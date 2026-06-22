#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import { provisionInstance } from './provision.js';
import { onboardModeCWallet, PrivyRestClient } from '@mandate/privy-admin';
import type { DelegationMode } from './delegation-mode.js';

function usageProvision(): void {
	console.error(`Usage: mandate-register provision [options]

Options (env fallbacks in parentheses):
  --onboard-token       CANOPY_PAYMENTS_ONBOARD_TOKEN (required)
  --canopy-url          CANOPY_API_URL or CANOPY_BASE_URL (required)
  --coordinator-url     DELEGATION_COORDINATOR_URL (required)
  --webhook-url         Agent webhook URL for genesis ?webhookUrl= (required)
  --mode                Delegation mode B or C (default: C)
  --univocity-addr      40-hex Univocity contract (CANOPY_UNIVOCITY_ADDR)
  --chain-id            EIP-155 chain id (CANOPY_CHAIN_ID, default 84532)
  --forest-r            Optional dashed UUID for genesis R (generated if omitted)

Mode C (Privy):
  --wallet-id           PRIVY_MODE_C_WALLET_ID
  --mandate-signer-id   PRIVY_MANDATE_SIGNER_ID
  --owner-auth-key      PRIVY_OWNER_AUTHORIZATION_KEY
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
  --wallet-id           Privy user-owned wallet id (PRIVY_MODE_C_WALLET_ID)
  --mandate-signer-id   Mandate key quorum id (PRIVY_MANDATE_SIGNER_ID)
  --owner-auth-key      Owner authorization key for wallet PATCH (PRIVY_OWNER_AUTHORIZATION_KEY)
  --key-ref             KEY_DIRECTORY keyRef (default: user-log-wallet)
  --log-id              32-hex log id (required)
  --signer-url          mandate-signer /v1/sign URL (MANDATE_SIGNER_URL)
  --policy-id           Existing policy id (optional; creates policy if omitted)
`);
	process.exit(1);
}

function readFlag(name: string): string | undefined {
	const index = process.argv.indexOf(name);
	if (index === -1 || index + 1 >= process.argv.length) return undefined;
	return process.argv[index + 1];
}

function envOr(flag: string | undefined, ...names: string[]): string | undefined {
	if (flag) return flag;
	for (const name of names) {
		const value = process.env[name]?.trim();
		if (value) return value;
	}
	return undefined;
}

async function runProvision(): Promise<void> {
	const onboardToken = envOr(readFlag('--onboard-token'), 'CANOPY_PAYMENTS_ONBOARD_TOKEN');
	const canopyBaseUrl = envOr(readFlag('--canopy-url'), 'CANOPY_API_URL', 'CANOPY_BASE_URL');
	const coordinatorBaseUrl = envOr(
		readFlag('--coordinator-url'),
		'DELEGATION_COORDINATOR_URL',
		'COORDINATOR_UPSTREAM_URL'
	);
	const agentWebhookUrl = envOr(readFlag('--webhook-url'), 'MANDATE_AGENT_WEBHOOK_URL');
	const modeRaw = (readFlag('--mode') ?? process.env.MANDATE_DELEGATION_MODE ?? 'C').toUpperCase();
	const mode = (modeRaw === 'B' ? 'B' : 'C') as DelegationMode;
	const univocityAddr = envOr(readFlag('--univocity-addr'), 'CANOPY_UNIVOCITY_ADDR');
	const chainId = envOr(readFlag('--chain-id'), 'CANOPY_CHAIN_ID') ?? '84532';
	const forestR = readFlag('--forest-r') ?? process.env.MANDATE_FOREST_R;

	if (
		!onboardToken ||
		!canopyBaseUrl ||
		!coordinatorBaseUrl ||
		!agentWebhookUrl ||
		!univocityAddr
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
		chainId,
		forestR: forestR ?? randomUUID()
	};

	if (mode === 'C') {
		const walletId = envOr(readFlag('--wallet-id'), 'PRIVY_MODE_C_WALLET_ID');
		const mandateSignerId = envOr(readFlag('--mandate-signer-id'), 'PRIVY_MANDATE_SIGNER_ID');
		const ownerAuthorizationKey = envOr(
			readFlag('--owner-auth-key'),
			'PRIVY_OWNER_AUTHORIZATION_KEY'
		);
		const signerUrl = envOr(readFlag('--signer-url'), 'MANDATE_SIGNER_URL');
		const appId = process.env.PRIVY_APP_ID;
		const appSecret = process.env.PRIVY_APP_SECRET;
		if (
			!walletId ||
			!mandateSignerId ||
			!ownerAuthorizationKey ||
			!signerUrl ||
			!appId ||
			!appSecret
		) {
			usageProvision();
		}
		const output = await provisionInstance({
			...base,
			modeC: {
				appId: appId!,
				appSecret: appSecret!,
				apiBase: process.env.PRIVY_API_BASE,
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
	const walletId = readFlag('--wallet-id') ?? process.env.PRIVY_MODE_C_WALLET_ID;
	const mandateSignerId = readFlag('--mandate-signer-id') ?? process.env.PRIVY_MANDATE_SIGNER_ID;
	const ownerAuthorizationKey =
		readFlag('--owner-auth-key') ?? process.env.PRIVY_OWNER_AUTHORIZATION_KEY;
	const keyRef = readFlag('--key-ref') ?? 'user-log-wallet';
	const logId = readFlag('--log-id');
	const signerUrl = readFlag('--signer-url') ?? process.env.MANDATE_SIGNER_URL;
	const policyId = readFlag('--policy-id');
	const appId = process.env.PRIVY_APP_ID;
	const appSecret = process.env.PRIVY_APP_SECRET;

	if (
		!walletId ||
		!mandateSignerId ||
		!ownerAuthorizationKey ||
		!logId ||
		!signerUrl ||
		!appId ||
		!appSecret
	) {
		usageOnboardModeC();
	}

	const client = new PrivyRestClient({
		appId: appId!,
		appSecret: appSecret!,
		apiBase: process.env.PRIVY_API_BASE
	});

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

async function main(): Promise<void> {
	const sub = process.argv[2];
	const cmd = process.argv[3];

	if (sub === 'provision') {
		await runProvision();
		return;
	}

	if (sub === 'privy' && cmd === 'onboard-mode-c') {
		await runOnboardModeC();
		return;
	}

	console.log('mandate-register: Univocity instance provisioning (FOR-100)');
	console.log('  subcommands:');
	console.log('    provision              Full genesis + descriptor emission');
	console.log('    privy onboard-mode-c   Mode C Privy wallet onboarding only (FOR-112)');
	process.exit(sub ? 1 : 0);
}

main().catch((error: unknown) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
});
