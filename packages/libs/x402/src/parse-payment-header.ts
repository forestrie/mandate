import type { OperatorPaymentConfig } from './operator-payment-config.js';
import type { ParsePaymentResult, PaymentPayload } from './types.js';

/** EIP-3009 authorization fields that must all be present as strings. */
const REQUIRED_AUTH_FIELDS = ['from', 'to', 'value', 'validAfter', 'validBefore', 'nonce'] as const;

/**
 * Parse and structurally validate an `X-PAYMENT` header against **this
 * operator's** configured terms.
 *
 * Supports the v2 shape (`{ x402Version: 2, accepted, payload }`) and the
 * legacy flat shape (`{ x402Version, scheme, network, payload }`).
 *
 * This proves the payload is well-formed and addressed to this operator. It
 * does **not** prove settlement — that is the facilitator's job, and issuance
 * must wait for it.
 */
export function parsePaymentHeader(
	raw: string | null,
	config: OperatorPaymentConfig
): ParsePaymentResult {
	if (!raw || !raw.trim()) {
		return { ok: false, error: 'missing X-PAYMENT header' };
	}

	let json: string;
	try {
		json = atob(raw);
	} catch {
		return { ok: false, error: 'X-PAYMENT is not valid base64' };
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(json);
	} catch {
		return { ok: false, error: 'X-PAYMENT is not valid JSON' };
	}

	if (typeof parsed !== 'object' || parsed === null) {
		return { ok: false, error: 'X-PAYMENT must be a JSON object' };
	}
	const obj = parsed as Record<string, unknown>;

	const version = obj.x402Version;
	if (version !== 1 && version !== 2) {
		return { ok: false, error: 'x402Version must be 1 or 2' };
	}

	const isV2 = typeof obj.accepted === 'object' && obj.accepted !== null;
	const accepted = (isV2 ? obj.accepted : obj) as Record<string, unknown>;

	if (accepted.scheme !== 'exact') {
		return { ok: false, error: 'only "exact" scheme is supported' };
	}

	if (accepted.network !== config.network) {
		return {
			ok: false,
			error: `network must be ${config.network}, got ${String(accepted.network)}`
		};
	}

	const inner = obj.payload;
	if (typeof inner !== 'object' || inner === null) {
		return { ok: false, error: 'payload must be an object' };
	}
	const payload = inner as Record<string, unknown>;

	if (typeof payload.signature !== 'string' || !payload.signature) {
		return { ok: false, error: 'payload.signature is required' };
	}

	const auth = payload.authorization;
	if (typeof auth !== 'object' || auth === null) {
		return { ok: false, error: 'payload.authorization is required' };
	}
	const authObj = auth as Record<string, unknown>;

	for (const field of REQUIRED_AUTH_FIELDS) {
		if (typeof authObj[field] !== 'string') {
			return { ok: false, error: `payload.authorization.${field} is required` };
		}
	}

	// The payee must be *this* operator. A payment addressed elsewhere buys
	// nothing here, however valid it is on chain.
	const expectedPayTo = config.payTo.toLowerCase();
	const actualPayTo = (authObj.to as string).toLowerCase();
	if (actualPayTo !== expectedPayTo) {
		return {
			ok: false,
			error: `authorization.to must be ${expectedPayTo}, got ${actualPayTo}`
		};
	}

	// The operator prices its own grants; underpayment is not a partial sale.
	const amount = authObj.value as string;
	if (amount !== config.priceAtomic) {
		return {
			ok: false,
			error: `authorization.value must be ${config.priceAtomic}, got ${amount}`
		};
	}

	return {
		ok: true,
		value: {
			scheme: 'exact',
			network: accepted.network as string,
			payTo: authObj.to as string,
			payerAddress: authObj.from as string,
			amount,
			payload: obj as unknown as PaymentPayload
		}
	};
}
