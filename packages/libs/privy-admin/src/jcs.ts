import canonicalize from 'canonicalize';

/** RFC 8785 JSON Canonicalization Scheme (JCS) for Privy authorization payloads. */
export function canonicalizeJson(value: unknown): string {
	const result = canonicalize(value);
	if (typeof result !== 'string') {
		throw new Error('JCS: cannot canonicalize value');
	}
	return result;
}

/** Privy authorization-signature body normalization (empty object → ""). */
export function normalizePrivyAuthorizationBody(
	body: Record<string, unknown>
): Record<string, unknown> | string {
	if (Object.keys(body).length === 0) {
		return '';
	}
	return body;
}
