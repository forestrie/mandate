#!/usr/bin/env node
import { onboardModeCWallet, PrivyRestClient } from '@mandate/privy-admin';

function usage(): void {
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

async function main(): Promise<void> {
	const sub = process.argv[2];
	const cmd = process.argv[3];
	if (sub !== 'privy' || cmd !== 'onboard-mode-c') {
		console.log('mandate-register: provisioning not implemented — see FOR-100');
		console.log('  subcommand: privy onboard-mode-c (FOR-112 Mode C onboarding)');
		process.exit(sub === 'privy' && !cmd ? 1 : 0);
	}

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
		usage();
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

main().catch((error: unknown) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
});
