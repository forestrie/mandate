import { describe, expect, it } from 'vitest';
import { AGENT_PACKAGE } from '../src/index.js';

describe('@mandate/agent scaffold', () => {
	it('exports the package name constant', () => {
		expect(AGENT_PACKAGE).toBe('@mandate/agent');
	});
});
