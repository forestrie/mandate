const LOG_ID_BYTES = 16;

function formatDashedUuid(hex32: string): string {
	return `${hex32.slice(0, 8)}-${hex32.slice(8, 12)}-${hex32.slice(12, 16)}-${hex32.slice(16, 20)}-${hex32.slice(20, 32)}`;
}

function uuidToHex32(uuid: string): string {
	const hex = uuid.replace(/-/g, '').toLowerCase();
	if (hex.length !== 32 || !/^[0-9a-f]+$/.test(hex)) {
		throw new Error(`invalid UUID for log id: ${uuid}`);
	}
	return hex;
}

/** Canonical dashed UUID from 32-hex log id (no dashes). */
export function rFromLogIdHex32(logIdHex32: string): string {
	return formatDashedUuid(logIdHex32.toLowerCase());
}

/** 32-char lowercase hex log id from forest genesis path segment `R` (UUID). */
export function logIdFromR(forestR: string): string {
	return uuidToHex32(forestR);
}

/** Validate and normalize a caller-supplied forest `R` (dashed UUID). */
export function normalizeForestR(forestR: string): string {
	const trimmed = forestR.trim();
	if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) {
		throw new Error('forest R must be a canonical dashed UUID');
	}
	return trimmed.toLowerCase();
}

/** Round-trip: dashed UUID ↔ 32-hex matches canopy log-id-wire storage convention. */
export function logIdHex32ToBytes(logIdHex32: string): Uint8Array {
	const hex = logIdHex32.toLowerCase();
	if (hex.length !== 32) {
		throw new Error(`logId hex must be 32 chars; got ${hex.length}`);
	}
	const bytes = new Uint8Array(LOG_ID_BYTES);
	for (let i = 0; i < LOG_ID_BYTES; i++) {
		bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
	}
	return bytes;
}

/** 32-byte padded wire log id for genesis bootstrap-logid (-68010). */
export function logIdPaddedWire32(logIdHex32: string): Uint8Array {
	const wire = logIdHex32ToBytes(logIdHex32);
	const padded = new Uint8Array(32);
	padded.set(wire, 16);
	return padded;
}
