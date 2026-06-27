export function bytesToBase64(bytes: Uint8Array): string {
	if (typeof btoa === 'function') {
		let binary = '';
		for (const byte of bytes) binary += String.fromCharCode(byte);
		return btoa(binary);
	}
	return Buffer.from(bytes).toString('base64');
}

export function base64ToBytes(base64: string): Uint8Array {
	if (typeof atob === 'function') {
		const binary = atob(base64);
		const out = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
		return out;
	}
	return new Uint8Array(Buffer.from(base64, 'base64'));
}
