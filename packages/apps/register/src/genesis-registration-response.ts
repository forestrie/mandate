import type { CoordinatorRegistrationStatus } from './coordinator-registration-status.js';

export interface GenesisRegistrationResponse {
	R: string;
	class: 'payment-authoritative' | 'regular';
	chainBinding: {
		chainId: string;
		univocityAddr: string;
	};
	endorsedBy?: string;
	coordinator?: CoordinatorRegistrationStatus;
}
