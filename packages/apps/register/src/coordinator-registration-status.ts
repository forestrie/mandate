export type CoordinatorForwardStepStatus = 'ok' | 'skipped' | 'error';

export interface CoordinatorRegistrationStatus {
	publicRoot: CoordinatorForwardStepStatus;
	webhook: CoordinatorForwardStepStatus;
	detail?: string;
}
