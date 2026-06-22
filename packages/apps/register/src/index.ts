/** Operator inputs for instance provisioning (FOR-100). */
export interface RegisterConfig {
	/** Minted canopy onboard bearer for payment-authoritative genesis. */
	onboardToken: string;
	/** Canopy SCRAPI base URL (e.g. https://api-a.example.dev). */
	canopyBaseUrl: string;
	/** Delegation coordinator base URL. */
	coordinatorBaseUrl: string;
	/** Public URL of the delegation agent webhook (FOR-92 registration). */
	agentWebhookUrl?: string;
}

/** Scaffold placeholder — FOR-100 implements full canopy genesis provisioning. */
export const REGISTER_PACKAGE = '@mandate/register';

export {
	onboardModeCWallet,
	type OnboardModeCInput,
	type ModeCOnboardOutput
} from '@mandate/privy-admin';
