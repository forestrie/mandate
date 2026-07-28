import { describe, expect, it } from 'vitest';
import { checkOperatorBearer, operatorBffConfig } from './ops-ui-gate.js';

const ENV = {
	MANDATE_OPS_UI_TOKEN: 'ui-token',
	CANOPY_UPSTREAM_URL: 'https://canopy.test/',
	MANDATE_CANOPY_OPS_TOKEN: 'canopy-ops-token'
};

describe('operatorBffConfig', () => {
	it('normalises a trailing slash off the upstream url', () => {
		expect(operatorBffConfig(ENV)).toEqual({
			opsUiToken: 'ui-token',
			canopyUpstreamUrl: 'https://canopy.test',
			canopyOpsAdminToken: 'canopy-ops-token'
		});
	});

	it('is null when any of the three vars is missing or blank', () => {
		for (const key of Object.keys(ENV)) {
			expect(operatorBffConfig({ ...ENV, [key]: undefined })).toBeNull();
			expect(operatorBffConfig({ ...ENV, [key]: '  ' })).toBeNull();
		}
	});
});

describe('checkOperatorBearer', () => {
	function request(auth?: string): Request {
		return new Request('http://localhost/api/operator/instances', {
			headers: auth ? { Authorization: auth } : {}
		});
	}

	it('accepts the configured token only', async () => {
		expect(await checkOperatorBearer(request('Bearer ui-token'), 'ui-token')).toBe(true);
		expect(await checkOperatorBearer(request('Bearer wrong'), 'ui-token')).toBe(false);
		expect(await checkOperatorBearer(request('Bearer ui-token2'), 'ui-token')).toBe(false);
		expect(await checkOperatorBearer(request('ui-token'), 'ui-token')).toBe(false);
		expect(await checkOperatorBearer(request(), 'ui-token')).toBe(false);
	});
});
