import type { KeyRegistry } from '../signer/key-registry.js';
import { UnknownLogSignerError } from '../signer/key-registry.js';
import type { SignerKind } from '../signer/log-signer-descriptor.js';

/**
 * Authed, metadata-only introspection of the agent's live OPERATOR_ROOT_KEYS
 * entry for a logId (FOR-311 S1, plan-2607-14 W2).
 *
 * Purpose: lets a conformance harness deterministically observe that a config
 * put (e.g. the Mode C→B exit repoint) has propagated to the deployed Worker —
 * `kind:"remote"` read from the signing path's own per-request lookup
 * structurally excludes local signing. The response is built from an explicit
 * field ALLOWLIST; key material (`privateKeyHex`) can never appear because no
 * code path copies unlisted descriptor fields into the response.
 */

/** Allowlisted, secret-free view of a LogSignerDescriptor. */
export interface RootKeyConfigResponse {
	ok: true;
	kind: SignerKind;
	keyRef: string | null;
	signerUrl: string | null;
	configNonce: string | null;
}

export interface RootKeyConfigDeps {
	/** Fresh per-request registry over env.OPERATOR_ROOT_KEYS — the signing path's own lookup. */
	keyRegistry: KeyRegistry;
	/**
	 * Bearer expected on the endpoint (env `OPS_INTROSPECTION_TOKEN`). REQUIRED:
	 * when unset the endpoint refuses (503), so agents deployed without the ops
	 * token fail closed rather than exposing config metadata unauthenticated.
	 */
	opsIntrospectionToken?: string;
}

/** Constant-time comparison for equal-length UTF-8 strings (bearer tokens). */
export function timingSafeEqualString(a: string, b: string): boolean {
	const encoder = new TextEncoder();
	const aBytes = encoder.encode(a);
	const bBytes = encoder.encode(b);
	if (aBytes.length !== bBytes.length) return false;
	let diff = 0;
	for (let i = 0; i < aBytes.length; i++) {
		diff |= aBytes[i]! ^ bBytes[i]!;
	}
	return diff === 0;
}

const LOG_ID_HEX = /^[0-9a-fA-F]+$/;

export async function handleRootKeyConfig(
	request: Request,
	deps: RootKeyConfigDeps
): Promise<Response> {
	// Fail closed: no ops token configured means no introspection at all.
	if (!deps.opsIntrospectionToken) {
		return jsonResponse(503, { ok: false, error: 'ops introspection not configured' });
	}
	const auth = request.headers.get('Authorization') ?? '';
	if (!timingSafeEqualString(auth, `Bearer ${deps.opsIntrospectionToken}`)) {
		return jsonResponse(401, { ok: false, error: 'unauthorized' });
	}

	const logId = new URL(request.url).searchParams.get('logId') ?? '';
	if (!logId || !LOG_ID_HEX.test(logId)) {
		return jsonResponse(400, { ok: false, error: 'logId query parameter (hex) required' });
	}

	let descriptor;
	try {
		// Metadata-only reader: `describe` skips the interactive-root signing
		// refusal so a Safe 1x1 (Mode D) descriptor is still introspectable.
		descriptor = deps.keyRegistry.describe(logId);
	} catch (error) {
		if (error instanceof UnknownLogSignerError) {
			return jsonResponse(404, {
				ok: false,
				error: `no operator root configured for log ${logId}`
			});
		}
		// Map unparsable/invalid: never echo parse detail (could name other logIds).
		return jsonResponse(500, { ok: false, error: 'operator root key config unreadable' });
	}

	// ALLOWLIST: only these four metadata fields, copied individually. Do not
	// spread the descriptor — `privateKeyHex` and future secret-bearing fields
	// must be structurally unreachable, not filtered out.
	const body: RootKeyConfigResponse = {
		ok: true,
		kind: descriptor.kind,
		keyRef: descriptor.keyRef ?? null,
		signerUrl: descriptor.signerUrl ?? null,
		configNonce: descriptor.configNonce ?? null
	};
	return jsonResponse(200, body);
}

function jsonResponse(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}
