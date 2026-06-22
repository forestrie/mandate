import type { CoordinatorRegistrationStatus } from './coordinator-registration-status.js';
import type { GenesisRegistrationResponse } from './genesis-registration-response.js';
import type { ProvisionDescriptors } from './provision-config.js';
import type { DelegationMode } from './delegation-mode.js';

/** Result of `provisionInstance` — paste descriptors into worker secrets. */
export interface ProvisionResult {
	forestR: string;
	logIdHex32: string;
	mode: DelegationMode;
	genesis: GenesisRegistrationResponse;
	descriptors: ProvisionDescriptors;
	coordinator: CoordinatorRegistrationStatus;
}
