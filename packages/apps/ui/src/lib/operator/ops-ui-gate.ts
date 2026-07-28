/**
 * Gate for the operator-personality BFF routes (FOR-493).
 *
 * The console has no operator-wide identity — control-plane sessions are
 * per-log — so the optional forestrie-operator personality is enabled purely
 * by deployment configuration. `MANDATE_OPS_UI_TOKEN` is the console-side
 * credential the operator presents (pasted once into the page, held in
 * sessionStorage); it is checked here before the BFF spends its server-held
 * `MANDATE_CANOPY_OPS_TOKEN` (canopy's operator identity) upstream. The
 * browser never sees the canopy ops token. Missing configuration means the
 * personality is off: 501, mirroring the wallet-challenge auth gate.
 */

export interface OperatorBffConfig {
	opsUiToken: string;
	canopyUpstreamUrl: string;
	canopyOpsAdminToken: string;
}

export function operatorBffConfig(
	env: Record<string, string | undefined>
): OperatorBffConfig | null {
	const opsUiToken = env.MANDATE_OPS_UI_TOKEN?.trim();
	const canopyUpstreamUrl = env.CANOPY_UPSTREAM_URL?.trim().replace(/\/$/, '');
	const canopyOpsAdminToken = env.MANDATE_CANOPY_OPS_TOKEN?.trim();
	if (!opsUiToken || !canopyUpstreamUrl || !canopyOpsAdminToken) return null;
	return { opsUiToken, canopyUpstreamUrl, canopyOpsAdminToken };
}

export async function checkOperatorBearer(request: Request, expected: string): Promise<boolean> {
	const header = request.headers.get('Authorization') ?? '';
	const match = /^Bearer\s+(.+)$/.exec(header);
	if (!match) return false;
	return timingSafeStringEqual(match[1]!, expected);
}

/** RFC 9457 problem shape, matching the auth/session BFF routes. */
export function operatorProblem(status: number, title: string, detail: string): Response {
	return new Response(JSON.stringify({ type: 'about:blank', title, status, detail }), {
		status,
		headers: { 'Content-Type': 'application/problem+json' }
	});
}

/**
 * Compare fixed-length digests so the comparison cost is independent of
 * where the tokens differ and of their lengths.
 */
async function timingSafeStringEqual(a: string, b: string): Promise<boolean> {
	const enc = new TextEncoder();
	const [da, db] = await Promise.all([
		crypto.subtle.digest('SHA-256', enc.encode(a)),
		crypto.subtle.digest('SHA-256', enc.encode(b))
	]);
	const ua = new Uint8Array(da);
	const ub = new Uint8Array(db);
	let diff = 0;
	for (let i = 0; i < ua.length; i++) diff |= ua[i]! ^ ub[i]!;
	return diff === 0;
}
