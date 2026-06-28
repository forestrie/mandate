import type { PendingEntry } from '@mandate/coordinator-types';

/** Authority log id used across hermetic ui specs. */
export const E2E_AUTH_LOG_ID = '11111111-1111-1111-1111-111111111111';

/** User log id for kill-switch specs. */
export const E2E_USER_LOG_ID = 'b2c3d4e5f67890ab1234567890abcdef12';

/** Pre-generated P-256 COSE delegated public key (base64). */
export const SAMPLE_DELEGATED_PUBLIC_KEY_B64 =
	'pAECIAEh2EBYIAhdWHosXL4fALSX75DOf7YF5g862MUyZhGN4Bc4/MJxIthAWCCAtLh7eiOZqeqCchGbn8+uH6jjVty+tgnNSKJFv/16Cg==';

export function samplePendingEntry(overrides: Partial<PendingEntry> = {}): PendingEntry {
	return {
		id: 'entry-1',
		authLogIdHex32: E2E_AUTH_LOG_ID.replace(/-/g, ''),
		logIdHex32: E2E_USER_LOG_ID,
		mmrStart: 1,
		mmrEnd: 100,
		delegatedPublicKeyHash: 'e2e-delegated-key-hash',
		delegatedPublicKey: SAMPLE_DELEGATED_PUBLIC_KEY_B64,
		requestedAt: 1_700_000_000,
		...overrides
	};
}

export function samplePendingEntries(count = 2): PendingEntry[] {
	const base = samplePendingEntry();
	return Array.from({ length: count }, (_, i) => ({
		...base,
		id: `entry-${i + 1}`,
		mmrStart: base.mmrStart + i * 10,
		mmrEnd: base.mmrEnd + i * 10
	}));
}
