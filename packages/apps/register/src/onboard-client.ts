/** Self-service onboard request client (FOR-173). */

const CBOR_LABEL = 1;
const CBOR_CHAIN_ID = 2;
const CBOR_UNIVOCITY_ADDR = 3;
const CBOR_CONTACT_EMAIL = 4;
const CBOR_MANDATE_ORIGIN = 5;
const CBOR_REDEEM_CODE = 1;

export interface RequestOnboardOptions {
	canopyBaseUrl: string;
	label: string;
	chainId: string;
	univocityAddr: string;
	contactEmail: string;
	mandateOrigin?: string;
	fetchImpl?: typeof fetch;
}

export interface RequestOnboardResult {
	requestId: string;
	status: string;
	expiresAt: number;
	redeemCode: string;
}

export interface RedeemOnboardOptions {
	canopyBaseUrl: string;
	requestId: string;
	redeemCode: string;
	fetchImpl?: typeof fetch;
}

export interface OnboardStatusResult {
	requestId: string;
	status: string;
	expiresAt?: number;
	onboardTokenRef?: string;
}

async function decodeCborResponse(res: Response): Promise<Record<string, unknown>> {
	const { decode } = await import('cbor-x');
	return decode(new Uint8Array(await res.arrayBuffer())) as Record<string, unknown>;
}

function normalizeBase(base: string): string {
	return base.trim().replace(/\/$/, '');
}

export async function requestOnboardToken(
	opts: RequestOnboardOptions
): Promise<RequestOnboardResult> {
	const { encode } = await import('cbor-x');
	const fetchImpl = opts.fetchImpl ?? fetch;
	const body = new Map<number, unknown>([
		[CBOR_LABEL, opts.label],
		[CBOR_CHAIN_ID, opts.chainId],
		[CBOR_UNIVOCITY_ADDR, opts.univocityAddr.replace(/^0x/i, '')],
		[CBOR_CONTACT_EMAIL, opts.contactEmail]
	]);
	if (opts.mandateOrigin) {
		body.set(CBOR_MANDATE_ORIGIN, opts.mandateOrigin);
	}

	const response = await fetchImpl(`${normalizeBase(opts.canopyBaseUrl)}/api/onboarding/requests`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/cbor',
			Accept: 'application/cbor'
		},
		body: encode(body) as unknown as BodyInit
	});

	if (response.status !== 201) {
		const detail = await response.text().catch(() => '');
		throw new Error(`request onboard: expected 201, got ${response.status}: ${detail.slice(0, 300)}`);
	}

	const parsed = await decodeCborResponse(response);
	return {
		requestId: String(parsed.requestId),
		status: String(parsed.status),
		expiresAt: Number(parsed.expiresAt),
		redeemCode: String(parsed.redeemCode)
	};
}

export async function getOnboardRequestStatus(
	canopyBaseUrl: string,
	requestId: string,
	fetchImpl: typeof fetch = fetch
): Promise<OnboardStatusResult> {
	const response = await fetchImpl(
		`${normalizeBase(canopyBaseUrl)}/api/onboarding/requests/${encodeURIComponent(requestId)}`,
		{ headers: { Accept: 'application/cbor' } }
	);
	if (response.status !== 200) {
		throw new Error(`onboard status: expected 200, got ${response.status}`);
	}
	const parsed = await decodeCborResponse(response);
	return {
		requestId: String(parsed.requestId),
		status: String(parsed.status),
		expiresAt: parsed.expiresAt != null ? Number(parsed.expiresAt) : undefined,
		onboardTokenRef:
			typeof parsed.onboardTokenRef === 'string' ? parsed.onboardTokenRef : undefined
	};
}

export async function redeemOnboardToken(opts: RedeemOnboardOptions): Promise<string> {
	const { encode } = await import('cbor-x');
	const fetchImpl = opts.fetchImpl ?? fetch;
	const response = await fetchImpl(
		`${normalizeBase(opts.canopyBaseUrl)}/api/onboarding/requests/${encodeURIComponent(opts.requestId)}/redeem`,
		{
			method: 'POST',
			headers: {
				'Content-Type': 'application/cbor',
				Accept: 'application/cbor'
			},
			body: encode(new Map([[CBOR_REDEEM_CODE, opts.redeemCode]])) as unknown as BodyInit
		}
	);

	if (response.status !== 200) {
		const detail = await response.text().catch(() => '');
		throw new Error(`redeem onboard: expected 200, got ${response.status}: ${detail.slice(0, 300)}`);
	}

	const parsed = await decodeCborResponse(response);
	const token = parsed.token;
	if (typeof token !== 'string' || !token.trim()) {
		throw new Error('redeem onboard: response missing token');
	}
	return token.trim();
}
