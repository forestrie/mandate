// FOR-311: call btoa/atob via `globalThis`, never as bare `btoa(...)`/`atob(...)`.
// In the Workers runtime these WHATWG globals must be invoked with
// `this === globalThis`; a bare reference (which esbuild may inline into a class
// method, e.g. RemoteKs256Signer.signRemote) is detached and the runtime throws
// "Illegal invocation: function called with incorrect `this` reference" — which
// broke every post-exit remote sign. Same class of bug as the unbound `fetch`.
export function bytesToBase64(bytes: Uint8Array): string {
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return globalThis.btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
	const binary = globalThis.atob(base64);
	const out = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
	return out;
}

export function base64UrlToBytes(base64Url: string): Uint8Array {
	const padded = base64Url.replace(/-/g, '+').replace(/_/g, '/');
	const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
	return base64ToBytes(padded + pad);
}

/** Parse a 20-byte Ethereum address from `0x` hex. */
export function parseEthAddress(address: string): Uint8Array {
	const hex = address.trim().replace(/^0x/i, '');
	if (!/^[0-9a-fA-F]{40}$/.test(hex)) {
		throw new Error('rootSignerAddress must be 20-byte 0x hex');
	}
	const out = new Uint8Array(20);
	for (let i = 0; i < 20; i++) {
		out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
	}
	return out;
}

export function coordinatorOrigin(upstreamUrl: string): string {
	return new URL(upstreamUrl).origin;
}

export function assertSameOrigin(url: string, allowedOrigin: string): void {
	const origin = new URL(url).origin;
	if (origin !== allowedOrigin) {
		throw new Error(`materialSubmitUrl origin ${origin} is not allowed`);
	}
}
