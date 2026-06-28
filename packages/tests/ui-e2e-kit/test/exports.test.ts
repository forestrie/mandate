import { describe, expect, it } from 'vitest';
import * as kit from '../src/index.js';

describe('public kit exports', () => {
	it('exposes coordinator mock and Playwright console fixture helpers', () => {
		expect(typeof kit.installCoordinatorMocks).toBe('function');
		expect(typeof kit.loginWithMockPrivy).toBe('function');
		expect(typeof kit.loadPending).toBe('function');
		expect(typeof kit.samplePendingEntry).toBe('function');
		expect(kit.E2E_AUTH_LOG_ID).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
		);
	});
});
