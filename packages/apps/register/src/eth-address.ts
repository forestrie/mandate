/** Parse a checksummed or lowercase `0x` Ethereum address to 20 bytes. */
export function parseEthAddressToBytes(address: string): Uint8Array {
	const hex = address.trim().replace(/^0x/i, '');
	if (!/^[0-9a-fA-F]{40}$/.test(hex)) {
		throw new Error(`invalid Ethereum address: ${address}`);
	}
	return Buffer.from(hex, 'hex');
}

/** Parse 40-char hex univocity contract address (no `0x`). */
export function parseUnivocityAddrHex(hex40: string): Uint8Array {
	const hex = hex40.trim().replace(/^0x/i, '');
	if (!/^[0-9a-fA-F]{40}$/.test(hex)) {
		throw new Error(`univocity address must be 40 hex chars; got ${hex.length}`);
	}
	return Buffer.from(hex, 'hex');
}
