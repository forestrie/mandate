// Isomorphic (no Buffer): these run in the browser onboarding wizard too.
function hex40ToBytes(hex: string): Uint8Array {
	const out = new Uint8Array(20);
	for (let i = 0; i < 20; i++) {
		out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
	}
	return out;
}

/** Parse a checksummed or lowercase `0x` Ethereum address to 20 bytes. */
export function parseEthAddressToBytes(address: string): Uint8Array {
	const hex = address.trim().replace(/^0x/i, '');
	if (!/^[0-9a-fA-F]{40}$/.test(hex)) {
		throw new Error(`invalid Ethereum address: ${address}`);
	}
	return hex40ToBytes(hex);
}

/** Parse 40-char hex univocity contract address (no `0x`). */
export function parseUnivocityAddrHex(hex40: string): Uint8Array {
	const hex = hex40.trim().replace(/^0x/i, '');
	if (!/^[0-9a-fA-F]{40}$/.test(hex)) {
		throw new Error(`univocity address must be 40 hex chars; got ${hex.length}`);
	}
	return hex40ToBytes(hex);
}
