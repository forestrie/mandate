import type { OperatorRootKeysMap } from './describe-post-revoke-actions.js';
import type { OperatorRootKeyEntry } from './operator-root-key-entry.js';

/**
 * bearerEnvKey written into the repointed OPERATOR_ROOT_KEYS entry and the agent
 * secret name the user-operated signer's bearer is stored under. Matches
 * `@mandate/reference-user-signer` `USER_SIGNER_BEARER`.
 */
export const USER_SIGNER_BEARER_ENV_KEY = 'USER_SIGNER_BEARER';

/** Default keyRef for the repointed entry (Mode B user remote signer). */
export const DEFAULT_EXIT_KEY_REF = 'user-remote';

export class ExitToModeBError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ExitToModeBError';
	}
}

/**
 * Redact private key material from an OPERATOR_ROOT_KEYS map before it is
 * echoed (S2, plan-2607-14). The typed entry shape is remote-only, but the
 * runtime map is parsed JSON that can carry pass-through `kind:"local"`
 * entries holding `privateKeyHex` (the burner conformance fixture does).
 * Structure and keys are preserved so the output stays diagnostic; only the
 * secret value is replaced.
 */
export function redactOperatorRootKeys(map: OperatorRootKeysMap): OperatorRootKeysMap {
	const redacted: OperatorRootKeysMap = {};
	for (const [logId, entry] of Object.entries(map)) {
		const clone: Record<string, unknown> = { ...(entry as unknown as Record<string, unknown>) };
		if ('privateKeyHex' in clone) clone.privateKeyHex = '<redacted>';
		redacted[logId] = clone as unknown as OperatorRootKeyEntry;
	}
	return redacted;
}

/**
 * Stamp a fresh config-version nonce onto every entry of an OPERATOR_ROOT_KEYS
 * map about to be put (FOR-311 S1). Per-entry rather than top-level because the
 * agent's KeyRegistry treats every top-level key as a logId descriptor; a
 * top-level scalar would fail its parse. One nonce per put identifies the put:
 * the agent's GET /ops/root-key-config echoes it, so a caller can poll until
 * the deployed Worker demonstrably serves THIS map version. Pure — entries are
 * cloned, pass-through fields (including local `privateKeyHex`) preserved.
 */
export function stampConfigNonce(
	map: OperatorRootKeysMap,
	configNonce: string
): OperatorRootKeysMap {
	const stamped: OperatorRootKeysMap = {};
	for (const [logId, entry] of Object.entries(map)) {
		stamped[logId] = {
			...(entry as unknown as Record<string, unknown>),
			configNonce
		} as unknown as OperatorRootKeyEntry;
	}
	return stamped;
}

function findLogIdKey(map: OperatorRootKeysMap, logId: string): string | undefined {
	if (map[logId]) return logId;
	const lower = logId.toLowerCase();
	return Object.keys(map).find((key) => key.toLowerCase() === lower);
}

/**
 * Compute the OPERATOR_ROOT_KEYS repoint for ADR-0005 exit step 3 (Mode C→B).
 *
 * Pure: preserves `rootSignerAddress` (the log's public root is unchanged — the
 * FOR-311 portability invariant) and only swaps the signer route from the
 * mandate-operated signer to the user-operated signer. Never re-derives the root
 * from a flag, so the public root cannot drift through this path.
 */
export function computeExitToModeBOperatorRootKeys(
	current: OperatorRootKeysMap,
	params: { logId: string; userSignerUrl: string; keyRef: string }
): { updated: OperatorRootKeysMap; previous: OperatorRootKeyEntry; next: OperatorRootKeyEntry } {
	const key = findLogIdKey(current, params.logId);
	if (!key) {
		throw new ExitToModeBError(
			`logId "${params.logId}" not found in OPERATOR_ROOT_KEYS; nothing to repoint`
		);
	}
	const previous = current[key];
	const next: OperatorRootKeyEntry = {
		alg: previous.alg,
		rootSignerAddress: previous.rootSignerAddress,
		kind: 'remote',
		signerUrl: params.userSignerUrl,
		keyRef: params.keyRef,
		bearerEnvKey: USER_SIGNER_BEARER_ENV_KEY
	};
	return { updated: { ...current, [key]: next }, previous, next };
}

/** Resolved options for the Mode C→B exit command (FOR-311). */
export interface ExitToModeBCommandOptions {
	/** 32-hex log id whose OPERATOR_ROOT_KEYS entry is repointed. */
	logId: string;
	/** wrangler `--name` target for the deployed agent Worker (e.g. mandate-agent). */
	agentName: string;
	/** `@mandate/reference-user-signer` `…/v1/sign` URL. */
	userSignerUrl: string;
	/** Bearer secret the agent presents to the user signer (written to USER_SIGNER_BEARER). */
	userSignerBearer: string;
	/** Current agent OPERATOR_ROOT_KEYS (source of truth from Doppler; secrets are write-only). */
	operatorRootKeys: OperatorRootKeysMap;
	/** keyRef for the repointed entry (default `user-remote`). */
	keyRef?: string;
	/** Skip the interactive confirmation prompt. */
	yes: boolean;
	/** No interactive TTY (CI or piped) — requires --yes. */
	nonInteractive: boolean;
}

/** Side-effect sinks so the command stays testable (no direct console/wrangler use). */
export interface ExitToModeBCommandIo {
	stdout(line: string): void;
	stderr(line: string): void;
	/** Interactive confirmation; only called when interactive and --yes is absent. */
	confirm?(prompt: string): Promise<boolean>;
	/** Apply a Cloudflare Worker secret to the agent (wrangler-backed in the CLI). */
	applyAgentSecret(name: string, value: string): Promise<void>;
}

/**
 * Run the Mode C→B exit command (ADR-0005 exit step 3). Returns a process exit
 * code and never calls process.exit, so callers/tests control termination. The
 * user signer bearer is never written to stdout/stderr.
 *
 * Precondition: the mandate signer has already been revoked at Privy
 * (`revoke-mode-c`, exit step 2). This command only repoints the agent's signer
 * route to the user-operated signer; it does not touch Privy.
 */
export async function runExitToModeBCommand(
	options: ExitToModeBCommandOptions,
	io: ExitToModeBCommandIo
): Promise<number> {
	if (!/^https:\/\//i.test(options.userSignerUrl)) {
		io.stderr(`--signer-url must be an https URL; got "${options.userSignerUrl}"`);
		return 1;
	}

	const keyRef = options.keyRef?.trim() || DEFAULT_EXIT_KEY_REF;
	let computed: ReturnType<typeof computeExitToModeBOperatorRootKeys>;
	try {
		computed = computeExitToModeBOperatorRootKeys(options.operatorRootKeys, {
			logId: options.logId,
			userSignerUrl: options.userSignerUrl,
			keyRef
		});
	} catch (error) {
		io.stderr(error instanceof Error ? error.message : String(error));
		return 1;
	}

	const { updated, previous, next } = computed;
	// Defensive: the public root must survive the repoint untouched (FOR-311).
	if (next.rootSignerAddress !== previous.rootSignerAddress) {
		io.stderr('refusing to exit: repoint would change rootSignerAddress (public root)');
		return 1;
	}

	// Fresh per-put config-version stamp (FOR-311 S1); echoed by the agent's
	// GET /ops/root-key-config so the caller can gate on propagation.
	const configNonce = crypto.randomUUID();
	const stamped = stampConfigNonce(updated, configNonce);

	io.stdout('Mode C→B exit — repoint signer to user-operated signer (ADR-0005 step 3)');
	io.stdout(`  logId:            ${options.logId}`);
	io.stdout(`  agent:            ${options.agentName}`);
	io.stdout(`  rootSignerAddr:   ${next.rootSignerAddress} (unchanged)`);
	io.stdout(`  signerUrl before: ${previous.signerUrl}`);
	io.stdout(`  signerUrl after:  ${next.signerUrl}`);
	io.stdout(`  keyRef:           ${next.keyRef}`);
	io.stdout(`  configNonce:      ${configNonce}`);

	if (options.nonInteractive) {
		if (!options.yes) {
			io.stderr('refusing to exit in non-interactive mode without --yes');
			return 1;
		}
	} else if (!options.yes) {
		const proceed = io.confirm ? await io.confirm('Proceed with repoint? [y/N] ') : false;
		if (!proceed) {
			io.stderr('aborted by operator');
			return 1;
		}
	}

	await io.applyAgentSecret('OPERATOR_ROOT_KEYS', JSON.stringify(stamped));
	await io.applyAgentSecret(USER_SIGNER_BEARER_ENV_KEY, options.userSignerBearer);

	// Emit the updated OPERATOR_ROOT_KEYS for operator paste / harness capture.
	// Pass-through entries can carry privateKeyHex, so redact before echoing:
	// only io.applyAgentSecret above ever sees the unredacted map. The top-level
	// configNonce is the S1 gate value — callers poll the agent's
	// /ops/root-key-config until it serves this nonce.
	io.stdout(
		JSON.stringify({ configNonce, operatorRootKeys: redactOperatorRootKeys(stamped) }, null, 2)
	);
	return 0;
}
