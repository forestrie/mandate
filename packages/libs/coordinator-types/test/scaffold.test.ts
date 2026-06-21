import { describe, expect, it } from 'vitest';

describe('@mandate/coordinator-types scaffold', () => {
	it('loads the placeholder module', async () => {
		const mod = await import('../src/index.js');
		expect(mod).toBeDefined();
	});
});
