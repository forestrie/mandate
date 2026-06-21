import { describe, expect, it } from 'vitest';
import { REGISTER_PACKAGE, type RegisterConfig } from '../src/index.js';

describe('@mandate/register scaffold', () => {
	it('exports RegisterConfig shape', () => {
		const config: RegisterConfig = {
			onboardToken: 'token',
			canopyBaseUrl: 'https://api.example.dev',
			coordinatorBaseUrl: 'https://coordinator.example.dev'
		};
		expect(config.onboardToken).toBe('token');
		expect(REGISTER_PACKAGE).toBe('@mandate/register');
	});
});
