import { describe, expect, it } from 'vitest';
import { REGISTER_PACKAGE, type ProvisionConfig } from '../src/index.js';

describe('@mandate/register scaffold', () => {
	it('exports ProvisionConfig shape', () => {
		const config: ProvisionConfig = {
			onboardToken: 'token',
			canopyBaseUrl: 'https://api.example.dev',
			coordinatorBaseUrl: 'https://coordinator.example.dev',
			agentWebhookUrl: 'https://agent.example/webhooks/delegation-required',
			mode: 'C',
			univocityAddr: 'abcd'.repeat(10),
			chainId: '84532'
		};
		expect(config.onboardToken).toBe('token');
		expect(REGISTER_PACKAGE).toBe('@mandate/register');
	});
});
