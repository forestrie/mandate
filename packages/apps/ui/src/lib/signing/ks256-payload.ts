import { keccak256, type Hex } from 'viem';

/**
 * KS256 COSE Sign1 Sig_structure hash per univocity plan-0029.
 * Bootstrap: detached payload hash only; full COSE assembly is follow-up work.
 */
export function buildKs256SigStructureHash(payloadBytes: Uint8Array): Hex {
	const sigStructure = encodeSigStructure(payloadBytes);
	return keccak256(sigStructure);
}

/** Minimal COSE Sig_structure for ALG_KS256 detached signing. */
function encodeSigStructure(payload: Uint8Array): Hex {
	const body = concatBytes(
		text('Signature1'),
		cborBytes(new Uint8Array([0xa1, 0x01, 0x26])), // {1: -7} placeholder protected
		cborBytes(new Uint8Array(0)),
		cborBytes(payload)
	);
	return `0x${bytesToHex(body)}` as Hex;
}

function text(value: string): Uint8Array {
	return new TextEncoder().encode(value);
}

function cborBytes(bytes: Uint8Array): Uint8Array {
	if (bytes.length < 24) {
		return new Uint8Array([0x40 + bytes.length, ...bytes]);
	}
	throw new Error('cbor bytes too long for bootstrap encoder');
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
	const total = parts.reduce((n, p) => n + p.length, 0);
	const out = new Uint8Array(total);
	let offset = 0;
	for (const part of parts) {
		out.set(part, offset);
		offset += part.length;
	}
	return out;
}

function bytesToHex(bytes: Uint8Array): string {
	return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function bytesToBase64(bytes: Uint8Array): string {
	if (typeof btoa === 'function') {
		let binary = '';
		for (const byte of bytes) binary += String.fromCharCode(byte);
		return btoa(binary);
	}
	return Buffer.from(bytes).toString('base64');
}

export function hexToBytes(hex: Hex): Uint8Array {
	const stripped = hex.startsWith('0x') ? hex.slice(2) : hex;
	const out = new Uint8Array(stripped.length / 2);
	for (let i = 0; i < out.length; i++) {
		out[i] = parseInt(stripped.slice(i * 2, i * 2 + 2), 16);
	}
	return out;
}
