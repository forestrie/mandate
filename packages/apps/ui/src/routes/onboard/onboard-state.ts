/**
 * Pure progress/persistence logic for the Safe 1x1 (Mode D) onboard wizard
 * (plan-2607-45 slice 04), split from the page for unit testing — the
 * delegations console pattern.
 *
 * Progress is session-scoped: an onboard spans an out-of-band ops approval,
 * so the operator may refresh or come back mid-poll. Everything needed to
 * resume — request id, redeem code, onboard token, the forest R chosen
 * before genesis — survives in sessionStorage; clearing it abandons the
 * attempt (server-side state is unaffected).
 */

const PROGRESS_STORAGE_KEY = 'mandate.session.onboard';

export type OnboardRequestStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'redeemed';

export interface OnboardProgress {
	/** Instance inputs, fixed once the onboard request is submitted. */
	chainId: string;
	univocityAddr: string;
	label: string;
	contactEmail: string;
	/**
	 * The Safe that signed the attestation, pinned at submit. Every later
	 * signing/genesis step must use THIS address — the connected wallet can
	 * change mid-wizard, and genesis with a different Safe would register a
	 * root diverging from the attestation.
	 */
	safeAddress?: string;
	/** Set once `requestOnboardToken` succeeds. */
	requestId?: string;
	redeemCode?: string;
	requestStatus?: OnboardRequestStatus;
	/** Set once the redeem step exchanges the code for an onboard token. */
	onboardToken?: string;
	/**
	 * Chosen and persisted BEFORE genesis is posted so a retry re-uses the
	 * same R — genesis for the same root is idempotent server-side, a fresh
	 * R would claim a second log id.
	 */
	forestR?: string;
	/** Set once genesis succeeds. */
	logIdHex32?: string;
	univocityInstanceId?: string;
	/** Genesis best-effort coordinator public-root registration outcome. */
	publicRootRegistered?: boolean;
	/** Set once the signing route is `wallet` — the wizard's terminal state. */
	signingRouteSet?: boolean;
}

export type OnboardStep =
	| 'details'
	| 'awaiting-approval'
	| 'redeem'
	| 'genesis'
	| 'signing-route'
	| 'done'
	| 'failed';

export function emptyProgress(): OnboardProgress {
	return { chainId: '', univocityAddr: '', label: '', contactEmail: '' };
}

export function loadProgress(): OnboardProgress {
	if (typeof sessionStorage === 'undefined') return emptyProgress();
	const raw = sessionStorage.getItem(PROGRESS_STORAGE_KEY);
	if (!raw) return emptyProgress();
	try {
		return { ...emptyProgress(), ...(JSON.parse(raw) as OnboardProgress) };
	} catch {
		return emptyProgress();
	}
}

export function saveProgress(progress: OnboardProgress): void {
	if (typeof sessionStorage === 'undefined') return;
	sessionStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(progress));
}

export function clearProgress(): void {
	if (typeof sessionStorage === 'undefined') return;
	sessionStorage.removeItem(PROGRESS_STORAGE_KEY);
}

/**
 * Where a (possibly resumed) onboard stands. Safe connection is page state,
 * not progress state — a resumed session re-connects before it can sign, so
 * the page gates every signing step on the wallet store, not on this.
 */
export function deriveStep(progress: OnboardProgress): OnboardStep {
	if (progress.requestStatus === 'rejected' || progress.requestStatus === 'expired') {
		return 'failed';
	}
	if (progress.signingRouteSet) return 'done';
	if (progress.logIdHex32) return 'signing-route';
	if (progress.onboardToken) return 'genesis';
	if (progress.requestStatus === 'approved' || progress.requestStatus === 'redeemed') {
		return 'redeem';
	}
	if (progress.requestId) return 'awaiting-approval';
	return 'details';
}

/** 40-hex univocity contract address, `0x` optional; empty string = invalid. */
export function normalizeUnivocityAddrInput(value: string): string | null {
	const hex = value.trim().replace(/^0x/i, '');
	if (!/^[0-9a-fA-F]{40}$/.test(hex)) return null;
	return hex.toLowerCase();
}

export function validateDetails(progress: OnboardProgress): string | null {
	if (!/^\d+$/.test(progress.chainId.trim())) {
		return 'Chain id must be a decimal number, e.g. 84532.';
	}
	if (normalizeUnivocityAddrInput(progress.univocityAddr) === null) {
		return 'Univocity address must be a 40-hex contract address (0x optional).';
	}
	if (!progress.label.trim()) {
		return 'Label is required — it names the request for the approving operator.';
	}
	if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(progress.contactEmail.trim())) {
		return 'A contact email is required for the approval workflow.';
	}
	return null;
}

/**
 * Guard for every step that acts on the attested Safe: null when the
 * connected Safe matches the pinned one (or nothing is pinned yet), else a
 * user-facing refusal naming both addresses.
 */
export function pinnedSafeGuard(
	progress: OnboardProgress,
	connectedSafeAddress: string | undefined
): string | null {
	if (!progress.safeAddress) return null;
	if (
		connectedSafeAddress &&
		connectedSafeAddress.toLowerCase() === progress.safeAddress.toLowerCase()
	) {
		return null;
	}
	return `This request was attested by Safe ${progress.safeAddress}. Reconnect and validate that Safe to continue${connectedSafeAddress ? ` — the connected Safe ${connectedSafeAddress} cannot complete it` : ''}.`;
}

/**
 * Choose (once) and keep the forest R. Returns true when R was just chosen —
 * the caller MUST persist before posting genesis: a retry has to re-use the
 * same R (same-root genesis is idempotent; a fresh R claims a second log id).
 */
export function ensureForestR(
	progress: OnboardProgress,
	generate: () => string = () => crypto.randomUUID()
): boolean {
	if (progress.forestR) return false;
	progress.forestR = generate();
	return true;
}

/** Apply a genesis result to progress; publicRoot registration is best-effort. */
export function applyGenesisResult(
	progress: OnboardProgress,
	result: {
		logIdHex32: string;
		univocityInstanceId: string;
		genesis: { coordinator?: { publicRoot?: string } };
	}
): void {
	progress.logIdHex32 = result.logIdHex32;
	progress.univocityInstanceId = result.univocityInstanceId;
	progress.publicRootRegistered = result.genesis.coordinator?.publicRoot === 'ok';
}

export interface RedeemFailure {
	message: string;
	/** True only for the 410: the request expired and no retry can succeed. */
	terminal: boolean;
}

/**
 * Classify a redeem failure. Canopy's redeem is idempotent for this
 * request's own retries (a redeemed request + valid code re-issues a fresh
 * token), so everything except the 410 expiry is retryable in place.
 */
export function classifyRedeemFailure(status: number | undefined, detail?: string): RedeemFailure {
	if (status === 410) {
		return {
			message:
				'The onboard request expired before it could be redeemed. Start over to submit a new request.',
			terminal: true
		};
	}
	if (status === 409) {
		return {
			message: 'The redeem raced a concurrent attempt — retry Redeem.',
			terminal: false
		};
	}
	return {
		message: detail?.trim()
			? `Redeem failed: ${detail.trim()} — retry Redeem.`
			: 'Redeem failed — retry Redeem. Redeeming again is safe: the server re-issues the token for this request.',
		terminal: false
	};
}

/**
 * Copy for a failed genesis retry in the signing-route repair path. A 401
 * means the onboard token expired — the instance IS registered to this R;
 * ops can complete the coordinator registration out-of-band with the app
 * token, after which setting the signing route needs no onboard token.
 */
export function repairFailureCopy(status: number | undefined): string {
	if (status === 401) {
		return 'The onboard token has expired, so the console cannot re-run genesis to repair the coordinator registration. Your instance is already registered — ask ops to complete the coordinator public-root registration, then retry this step (it does not need the onboard token).';
	}
	return 'The coordinator did not record the log root — the signing route cannot be authorised yet. Retry shortly.';
}

/**
 * Drop the credentials once the wizard completes — the redeem code and
 * onboard token have no post-onboarding use and should not linger in
 * sessionStorage (residual replay-noise hygiene).
 */
export function scrubProgressSecrets(progress: OnboardProgress): void {
	delete progress.redeemCode;
	delete progress.onboardToken;
}

/** Human copy for the poll states — honest about the out-of-band approval. */
export function approvalCopy(status: OnboardRequestStatus | undefined): string {
	switch (status) {
		case 'approved':
		case 'redeemed':
			return 'Approved — redeem the onboard token to continue.';
		case 'rejected':
			return 'The operator rejected this request. Start over with corrected details.';
		case 'expired':
			return 'The request expired before approval. Start over to submit a new one.';
		default:
			return 'Awaiting operator approval. Approval happens out of band — there is no in-console approve button and no guaranteed turnaround. Progress is saved in this browser session, so you can close this page and come back.';
	}
}
