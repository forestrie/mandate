import { describe, expect, it } from 'vitest';
import { encodeCborDeterministic } from '@forestrie/encoding';
import {
	cborToPlain,
	fetchInstancePage,
	fetchKillSwitchEnabled,
	type OperatorInstancePage
} from './instances-client.js';
import type { OperatorBffConfig } from './ops-ui-gate.js';

const CFG: OperatorBffConfig = {
	opsUiToken: 'ui-token',
	canopyUpstreamUrl: 'https://canopy.test',
	canopyOpsAdminToken: 'canopy-ops-token'
};

const ROW = {
	univocityInstanceId: 'eip155:84532:0x' + 'ab'.repeat(20),
	state: 'registered',
	holder: 'request:r-1',
	reservedAt: 1_753_000_000,
	r: '11111111-2222-4333-8444-555555555555',
	registrationBlock: 44_750_035,
	receivables: {
		creditsBalance: 185,
		checkpointsAccrued: 0,
		arrears: 'current',
		enforcementFrozen: false,
		registrationBlock: 44_750_035,
		watermarkBlock: 44_750_092
	}
};

function cborResponse(body: unknown, status = 200): Response {
	return new Response(encodeCborDeterministic(body) as Uint8Array<ArrayBuffer>, {
		status,
		headers: { 'Content-Type': 'application/cbor' }
	});
}

describe('fetchInstancePage', () => {
	it('decodes the CBOR page to plain JSON rows and forwards the ops bearer', async () => {
		let seenUrl = '';
		let seenAuth = '';
		const result = await fetchInstancePage(CFG, { limit: '50' }, async (url, init) => {
			seenUrl = url;
			seenAuth = new Headers(init?.headers).get('Authorization') ?? '';
			return cborResponse({ instances: [ROW], cursor: 'next-page' });
		});
		expect(seenUrl).toBe('https://canopy.test/api/payments/chain-bindings?limit=50');
		expect(seenAuth).toBe('Bearer canopy-ops-token');
		expect(result.ok).toBe(true);
		const page = (result as { ok: true; value: OperatorInstancePage }).value;
		expect(page.cursor).toBe('next-page');
		expect(page.instances).toHaveLength(1);
		// Plain object, not a Map — JSON.stringify must survive the round trip.
		expect(JSON.parse(JSON.stringify(page.instances[0]))).toEqual(ROW);
	});

	it('passes the cursor through and omits absent params', async () => {
		let seenUrl = '';
		await fetchInstancePage(CFG, { cursor: 'abc/+=' }, async (url) => {
			seenUrl = url;
			return cborResponse({ instances: [] });
		});
		expect(seenUrl).toBe('https://canopy.test/api/payments/chain-bindings?cursor=abc%2F%2B%3D');
	});

	it('maps upstream 400 through and other failures to 502', async () => {
		const bad = await fetchInstancePage(CFG, { cursor: 'junk' }, async () =>
			cborResponse({ detail: 'invalid cursor' }, 400)
		);
		expect(bad).toMatchObject({ ok: false, status: 400 });

		const down = await fetchInstancePage(CFG, {}, async () =>
			cborResponse({ detail: 'nope' }, 503)
		);
		expect(down).toMatchObject({ ok: false, status: 502 });

		const thrown = await fetchInstancePage(CFG, {}, async () => {
			throw new Error('connection refused');
		});
		expect(thrown).toMatchObject({ ok: false, status: 502 });
	});

	it('rejects a shapeless body as 502', async () => {
		const result = await fetchInstancePage(CFG, {}, async () => cborResponse({ nope: true }));
		expect(result).toMatchObject({ ok: false, status: 502 });
	});
});

describe('fetchKillSwitchEnabled', () => {
	it('reads the admin JSON variant', async () => {
		let seenUrl = '';
		const result = await fetchKillSwitchEnabled(CFG, ROW.r, async (url) => {
			seenUrl = url;
			return new Response(JSON.stringify({ R: ROW.r, enabled: false }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			});
		});
		expect(seenUrl).toBe(`https://canopy.test/api/payments/admin/registrations/${ROW.r}/enabled`);
		expect(result).toMatchObject({ ok: true, value: { R: ROW.r, enabled: false } });
	});

	it('passes 404 through and maps upstream failure to 502', async () => {
		const missing = await fetchKillSwitchEnabled(
			CFG,
			ROW.r,
			async () =>
				new Response(JSON.stringify({ detail: 'Registration not found for log' }), { status: 404 })
		);
		expect(missing).toMatchObject({ ok: false, status: 404 });

		const down = await fetchKillSwitchEnabled(CFG, ROW.r, async () => {
			throw new Error('boom');
		});
		expect(down).toMatchObject({ ok: false, status: 502 });
	});
});

describe('cborToPlain', () => {
	it('converts nested Maps and arrays', () => {
		const value = new Map<string, unknown>([
			['a', [new Map([['b', 1]])]],
			['c', 'text']
		]);
		expect(cborToPlain(value)).toEqual({ a: [{ b: 1 }], c: 'text' });
	});
});
