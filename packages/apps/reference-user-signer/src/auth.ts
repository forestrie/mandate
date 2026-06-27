/** Constant-time comparison for equal-length UTF-8 strings (e.g. bearer tokens). */
export function timingSafeEqualString(a: string, b: string): boolean {
	const encoder = new TextEncoder();
	const aBytes = encoder.encode(a);
	const bBytes = encoder.encode(b);
	if (aBytes.length !== bBytes.length) return false;
	let diff = 0;
	for (let i = 0; i < aBytes.length; i++) {
		diff |= aBytes[i]! ^ bBytes[i]!;
	}
	return diff === 0;
}

const LOG_ID_HEX32 = /^[0-9a-fA-F]{32}$/;

export function isValidLogIdHex32(logId: string): boolean {
	return LOG_ID_HEX32.test(logId);
}

/** Max base64 length for sigStructure (~64 KiB decoded COSE Sig_structure). */
export const MAX_SIG_STRUCTURE_B64_LENGTH = 88_192;
