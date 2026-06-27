import {
	getWallet,
	removeAllAdditionalSigners,
	revokeModeCWallet,
	type PrivyRestClient
} from '@mandate/privy-admin';

/** Resolved options for the Mode C revoke command (FOR-132 guardrails). */
export interface RevokeModeCCommandOptions {
	walletId: string;
	ownerAuthorizationKey: string;
	mandateSignerId?: string;
	/** Operator-supplied wallet id that must equal walletId before any Privy call. */
	confirmWalletId?: string;
	/** Skip the interactive confirmation prompt. */
	yes: boolean;
	/** Ops escape hatch: clear ALL additional signers instead of targeted revoke. */
	clearAllAdditionalSigners: boolean;
	/** No interactive TTY (CI or piped) — requires both --yes and --confirm-wallet-id. */
	nonInteractive: boolean;
}

/** Side-effect sinks so the command stays testable (no direct console/process use). */
export interface RevokeModeCCommandIo {
	stdout(line: string): void;
	stderr(line: string): void;
	/** Interactive confirmation; only called when interactive and --yes is absent. */
	confirm?(prompt: string): Promise<boolean>;
}

/**
 * Run the Mode C revoke command with destructive-op guardrails (FOR-132).
 *
 * Returns a process exit code and never calls process.exit, so callers (and
 * tests) control termination. The owner authorization key is never written to
 * stdout/stderr.
 */
export async function runRevokeModeCCommand(
	client: PrivyRestClient,
	options: RevokeModeCCommandOptions,
	io: RevokeModeCCommandIo
): Promise<number> {
	// Wrong-wallet protection: a mismatching confirmation aborts before any
	// Privy call so an operator can never revoke a wallet they did not name.
	if (options.confirmWalletId !== undefined && options.confirmWalletId !== options.walletId) {
		io.stderr(
			`--confirm-wallet-id (${options.confirmWalletId}) does not match --wallet-id ` +
				`(${options.walletId}); aborting without contacting Privy`
		);
		return 1;
	}

	const action = options.clearAllAdditionalSigners ? 'full clear (ALL signers)' : 'targeted revoke';
	const wallet = await getWallet(client, options.walletId);
	const before = wallet.additional_signers ?? [];

	io.stdout('Mode C revoke — custody kill switch (ARC-0022 I3)');
	io.stdout(`  walletId:                 ${options.walletId}`);
	io.stdout(`  walletAddress:            ${wallet.address}`);
	io.stdout(`  mandateSigner:            ${options.mandateSignerId ?? '(not specified)'}`);
	io.stdout(`  additionalSigners before: ${before.length}`);
	io.stdout(`  action:                   ${action}`);

	if (options.nonInteractive) {
		if (!options.yes) {
			io.stderr(
				'refusing to revoke in non-interactive mode without --yes ' +
					'(pass --yes --confirm-wallet-id <wallet-id>)'
			);
			return 1;
		}
		if (options.confirmWalletId === undefined) {
			io.stderr('non-interactive revoke requires --confirm-wallet-id <wallet-id>');
			return 1;
		}
	} else if (!options.yes) {
		const proceed = io.confirm ? await io.confirm('Proceed with revoke? [y/N] ') : false;
		if (!proceed) {
			io.stderr('aborted by operator');
			return 1;
		}
	}

	if (options.clearAllAdditionalSigners) {
		await removeAllAdditionalSigners(client, options.walletId, options.ownerAuthorizationKey);
		io.stdout(
			JSON.stringify(
				{
					walletId: options.walletId,
					walletAddress: wallet.address,
					action: 'full-clear',
					additionalSignersAfter: []
				},
				null,
				2
			)
		);
		return 0;
	}

	const output = await revokeModeCWallet(client, {
		walletId: options.walletId,
		ownerAuthorizationKey: options.ownerAuthorizationKey,
		mandateSignerId: options.mandateSignerId,
		warn: (message) => io.stderr(message)
	});
	io.stdout(JSON.stringify(output, null, 2));
	return 0;
}
