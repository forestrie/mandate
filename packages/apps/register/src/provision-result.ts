import type { CoordinatorRegistrationStatus } from './coordinator-registration-status.js';
import type { GenesisRegistrationResponse } from './genesis-registration-response.js';
import type { ProvisionDescriptors } from './provision-config.js';
import type { DelegationMode } from './delegation-mode.js';

/** Result of `provisionInstance` — paste descriptors into worker secrets. */
export interface ProvisionResult {
	forestR: string;
	logIdHex32: string;
	mode: DelegationMode;
	/**
	 * Canonical CAIP-10 fee-account id (ADR-0059) derived from the genesis
	 * chain binding — the key for credits, arrears, and reservation surfaces.
	 */
	univocityInstanceId: string;
	genesis: GenesisRegistrationResponse;
	descriptors: ProvisionDescriptors;
	coordinator: CoordinatorRegistrationStatus;
}
