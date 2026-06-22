import canonicalize from 'canonicalize';
import { describe, expect, it } from 'vitest';
import { canonicalizeJson, normalizePrivyAuthorizationBody } from '../src/privy/jcs.js';

const REQUEST_EXPIRY = 1_700_000_060;

/**
 * Mirrors @privy-io/node `formatRequestForAuthorizationSignature` (authorization.mjs).
 */
function privyFormatRequestForAuthorizationSignature(input: {
	version: 1;
	method: 'POST';
	url: string;
	body: Record<string, unknown>;
	headers: Record<string, string>;
}): Uint8Array {
	const body =
		typeof input.body === 'object' && input.body !== null && Object.keys(input.body).length === 0
			? ''
			: input.body;
	const serialized = canonicalize({ ...input, body });
	if (!serialized) {
		throw new Error('Privy formatter failed to serialize');
	}
	return new TextEncoder().encode(serialized);
}

function buildPrivyRpcPayload(appId: string, walletId: string, hashHex: string) {
	const url = `https://api.privy.io/v1/wallets/${walletId}/rpc`;
	const body = {
		chain_type: 'ethereum',
		method: 'secp256k1_sign',
		params: { hash: hashHex }
	};
	return {
		version: 1 as const,
		method: 'POST' as const,
		url,
		body,
		headers: {
			'privy-app-id': appId,
			'privy-request-expiry': String(REQUEST_EXPIRY)
		}
	};
}

describe('JCS Privy conformance', () => {
	it('matches Privy formatRequestForAuthorizationSignature for secp256k1_sign RPC', () => {
		const input = buildPrivyRpcPayload('app-123', 'wallet-1', '0xdeadbeef');
		const privyBytes = privyFormatRequestForAuthorizationSignature(input);
		const ours = new TextEncoder().encode(
			canonicalizeJson({
				version: input.version,
				method: input.method,
				url: input.url,
				headers: input.headers,
				body: normalizePrivyAuthorizationBody(input.body)
			})
		);
		expect(Buffer.from(ours).toString('utf8')).toBe(Buffer.from(privyBytes).toString('utf8'));
	});

	it('matches Privy formatter when RPC body is empty (body becomes empty string)', () => {
		const input = {
			version: 1 as const,
			method: 'POST' as const,
			url: 'https://api.privy.io/v1/wallets/w1/rpc',
			body: {} as Record<string, never>,
			headers: {
				'privy-app-id': 'app-id',
				'privy-request-expiry': String(REQUEST_EXPIRY)
			}
		};
		const privyBytes = privyFormatRequestForAuthorizationSignature(input);
		const ours = new TextEncoder().encode(
			canonicalizeJson({
				version: input.version,
				method: input.method,
				url: input.url,
				headers: input.headers,
				body: normalizePrivyAuthorizationBody(input.body)
			})
		);
		expect(Buffer.from(ours).toString('utf8')).toBe(Buffer.from(privyBytes).toString('utf8'));
	});
});
