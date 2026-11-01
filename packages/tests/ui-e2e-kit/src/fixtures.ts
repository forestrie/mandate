import type { PendingEntry } from '@mandate/coordinator-types';

/** Authority log id used across hermetic ui specs. */
export const E2E_AUTH_LOG_ID = '11111111-1111-1111-1111-111111111111';

/** User log id for kill-switch specs. */
export const E2E_USER_LOG_ID = 'b2c3d4e5f67890ab1234567890abcdef12';

/**
 * Pre-generated P-256 COSE delegated public key (base64): canonical CBOR,
 * coordinates as plain bstr. (It was once cbor-x output with x/y wrapped in
 * tag 64, which strict decoders reject.)
 */
export const SAMPLE_DELEGATED_PUBLIC_KEY_B64 =
	'pAECIAEhWCAIXVh6LFy+HwC0l++Qzn+2BeYPOtjFMmYRjeAXOPzCcSJYIIC0uHt6I5mp6oJyEZufz64fqONW3L62Cc1IokW//XoK';

/**
 * One coordinator `PendingEntry` as the BFF returns it; range bounds are
 * canonical decimal uint64 strings (canopy plan-2611-01 D1).
 */
export function samplePendingEntry(overrides: Partial<PendingEntry> = {}): PendingEntry {
	return {
		id: 'entry-1',
		authLogIdHex32: E2E_AUTH_LOG_ID.replace(/-/g, ''),
		logIdHex32: E2E_USER_LOG_ID,
		mmrStart: '1',
		mmrEnd: '100',
		delegatedPublicKeyHash: 'e2e-delegated-key-hash',
		delegatedPublicKey: SAMPLE_DELEGATED_PUBLIC_KEY_B64,
		requestedAt: 1_700_000_000,
		...overrides
	};
}

/** `count` pending entries with distinct ids and ranges ten apart. */
export function samplePendingEntries(count = 2): PendingEntry[] {
	const base = samplePendingEntry();
	return Array.from({ length: count }, (_, i) => ({
		...base,
		id: `entry-${i + 1}`,
		mmrStart: String(BigInt(base.mmrStart) + BigInt(i * 10)),
		mmrEnd: String(BigInt(base.mmrEnd) + BigInt(i * 10))
	}));
}
