import type { CoordinatorRegistrationStatus } from './coordinator-registration-status.js';

/**
 * Canopy's genesis registration response (FOR-481 catch-up). The legacy
 * class/endorsement fields are gone (ADR-0059, plan-2607-43 slice 02): every
 * instance root is its own fee account, so the response carries only the
 * account identity — the chain binding, whose canonical rendering is the
 * `univocityInstanceId` (see `univocity-instance-id.ts`).
 */
export interface GenesisRegistrationResponse {
	R: string;
	chainBinding: {
		chainId: string;
		univocityAddr: string;
	};
	coordinator?: CoordinatorRegistrationStatus;
}
