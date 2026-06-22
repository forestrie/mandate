/**
 * Optional Privy owned-wallet authorization signature.
 * App-controlled wallets omit this header (Basic auth only).
 */
export async function buildPrivyAuthorizationSignature(
	authorizationKeyPem: string | undefined,
	request: { method: string; url: string; body: string }
): Promise<string | undefined> {
	if (!authorizationKeyPem?.trim()) return undefined;

	const pem = authorizationKeyPem.trim();
	const pemBody = pem
		.replace(/-----BEGIN [^-]+-----/g, '')
		.replace(/-----END [^-]+-----/g, '')
		.replace(/\s+/g, '');
	const der = Uint8Array.from(Buffer.from(pemBody, 'base64'));
	const key = await crypto.subtle.importKey(
		'pkcs8',
		der,
		{ name: 'ECDSA', namedCurve: 'P-256' },
		false,
		['sign']
	);

	const payload = new TextEncoder().encode(
		`${request.method.toUpperCase()}\n${request.url}\n${request.body}`
	);
	const digest = await crypto.subtle.digest('SHA-256', payload);
	const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, digest);
	return Buffer.from(new Uint8Array(signature)).toString('base64');
}
