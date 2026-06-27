import { getWallet, revokeModeCWallet, type PrivyRestClient } from '@mandate/privy-admin';

/** Resolved options for the Mode C revoke command (FOR-132 guardrails). */
export interface RevokeModeCCommandOptions {
	walletId: string;
	ownerAuthorizationKey: string;
	/** Required — identifies mandate for targeted revoke and post-revoke checks. */
	mandateSignerId: string;
	/** Operator-supplied wallet id that must equal walletId before any Privy call. */
	confirmWalletId?: string;
	/**
	 * Operator-supplied wallet address that must equal the Privy wallet address
	 * (independent second factor alongside --confirm-wallet-id).
	 */
	confirmWalletAddress?: string;
	/** Skip the interactive confirmation prompt. */
	yes: boolean;
	/** Ops escape hatch: clear ALL additional signers instead of targeted revoke. */
	clearAllAdditionalSigners: boolean;
	/** No interactive TTY (CI or piped) — requires --yes and confirmation flags. */
	nonInteractive: boolean;
}

/** Side-effect sinks so the command stays testable (no direct console/process use). */
export interface RevokeModeCCommandIo {
	stdout(line: string): void;
	stderr(line: string): void;
	/** Interactive confirmation; only called when interactive and --yes is absent. */
	confirm?(prompt: string): Promise<boolean>;
}

function addressesEqual(a: string, b: string): boolean {
	return a.toLowerCase() === b.toLowerCase();
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
	if (!options.mandateSignerId) {
		io.stderr(
			'revoke requires --mandate-signer-id / MANDATE_PRIVY_SIGNER_ID ' +
				'(mandatory for targeted and full-clear revoke paths)'
		);
		return 1;
	}

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

	if (
		options.confirmWalletAddress !== undefined &&
		!addressesEqual(options.confirmWalletAddress, wallet.address)
	) {
		io.stderr(
			`--confirm-wallet-address (${options.confirmWalletAddress}) does not match ` +
				`Privy wallet address (${wallet.address}); aborting without contacting Privy`
		);
		return 1;
	}

	io.stdout('Mode C revoke — custody kill switch (ARC-0022 I3)');
	io.stdout(`  walletId:                 ${options.walletId}`);
	io.stdout(`  walletAddress:            ${wallet.address}`);
	io.stdout(`  mandateSigner:            ${options.mandateSignerId}`);
	io.stdout(`  additionalSigners before: ${before.length}`);
	io.stdout(`  action:                   ${action}`);

	if (options.nonInteractive) {
		if (!options.yes) {
			io.stderr(
				'refusing to revoke in non-interactive mode without --yes ' +
					'(pass --yes --confirm-wallet-id <wallet-id> --confirm-wallet-address <address>)'
			);
			return 1;
		}
		if (options.confirmWalletId === undefined) {
			io.stderr('non-interactive revoke requires --confirm-wallet-id <wallet-id>');
			return 1;
		}
		if (options.confirmWalletAddress === undefined) {
			io.stderr(
				'non-interactive revoke requires --confirm-wallet-address <address> ' +
					'(must match the Privy wallet address from the pre-revoke summary)'
			);
			return 1;
		}
	} else if (!options.yes) {
		const proceed = io.confirm ? await io.confirm('Proceed with revoke? [y/N] ') : false;
		if (!proceed) {
			io.stderr('aborted by operator');
			return 1;
		}
	}

	const output = await revokeModeCWallet(client, {
		walletId: options.walletId,
		ownerAuthorizationKey: options.ownerAuthorizationKey,
		mandateSignerId: options.mandateSignerId,
		clearAllAdditionalSigners: options.clearAllAdditionalSigners
	});
	io.stdout(JSON.stringify(output, null, 2));
	emitPostRevokeHint(io, options.walletId);
	return 0;
}

/** Remind the operator to prune KEY_DIRECTORY after a successful revoke (FOR-131). */
function emitPostRevokeHint(io: RevokeModeCCommandIo, walletId: string): void {
	io.stderr(
		'next: run `mandate-register privy describe-post-revoke-actions ' +
			`--wallet-id ${walletId} --key-ref <keyRef>` +
			'` to prune the KEY_DIRECTORY entry and rotate signer Worker secrets'
	);
}
