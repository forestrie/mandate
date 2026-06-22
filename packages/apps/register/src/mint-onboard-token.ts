/** Mint onboard token via canopy ops API (FOR-101 live e2e). */
export async function mintOnboardToken(opts: {
	canopyBaseUrl: string;
	opsAdminToken: string;
	label?: string;
	fetchImpl?: typeof fetch;
}): Promise<string> {
	const { encode } = await import('cbor-x');
	const fetchImpl = opts.fetchImpl ?? fetch;
	const base = opts.canopyBaseUrl.trim().replace(/\/$/, '');
	const response = await fetchImpl(`${base}/api/payments/onboard-tokens`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${opts.opsAdminToken}`,
			'Content-Type': 'application/cbor',
			Accept: 'application/cbor'
		},
		body: encode(new Map([[1, opts.label ?? 'mandate-provision-e2e']])) as unknown as BodyInit
	});
	if (response.status !== 201) {
		const detail = await response.text().catch(() => '');
		throw new Error(
			`mint onboard token: expected 201, got ${response.status}: ${detail.slice(0, 300)}`
		);
	}
	const { decode } = await import('cbor-x');
	const body = decode(new Uint8Array(await response.arrayBuffer())) as { token?: string };
	const token = body.token?.trim();
	if (!token) {
		throw new Error('mint onboard token: response missing token field');
	}
	return token;
}
