import { describe, expect, it } from 'vitest';
import type { SafeReadTransport } from './safe-validation.js';
import { validateSafeAccount } from './safe-validation.js';

const SAFE = '0xCdD289cC5420529d1C4D0498FA3DaAb549A07a63';
const OWNER = '0x242382c2b4279205dd2c180232ef1673d5192ad7';
const OTHER = `0x${'99'.repeat(20)}`;

const GET_OWNERS = '0xa0e67e2b';
const GET_THRESHOLD = '0xe75235b8';

function word(value: bigint | number): string {
	return BigInt(value).toString(16).padStart(64, '0');
}

function addressWord(address: string): string {
	return address.replace(/^0x/, '').toLowerCase().padStart(64, '0');
}

function encodeOwners(owners: string[]): string {
	return `0x${word(0x20)}${word(owners.length)}${owners.map(addressWord).join('')}`;
}

function fakeSafe({
	owners = [OWNER],
	threshold = 1,
	code = '0x600160005260206000f3'
}: {
	owners?: string[];
	threshold?: number;
	code?: string;
} = {}): SafeReadTransport {
	return {
		async getCode(address) {
			expect(address).toBe(SAFE);
			return code;
		},
		async call(to, data) {
			expect(to).toBe(SAFE);
			if (data === GET_OWNERS) return encodeOwners(owners);
			if (data === GET_THRESHOLD) return `0x${word(threshold)}`;
			throw new Error(`unexpected calldata ${data}`);
		}
	};
}

describe('validateSafeAccount', () => {
	it('accepts a deployed 1-of-1 Safe owned by the connected wallet', async () => {
		const result = await validateSafeAccount(fakeSafe(), SAFE, OWNER);
		expect(result).toEqual({ ok: true, owners: [OWNER.toLowerCase()], threshold: 1 });
	});

	it('owner matching is case-insensitive (checksummed wallet vs lowercase chain)', async () => {
		const result = await validateSafeAccount(
			fakeSafe(),
			SAFE,
			'0x242382C2B4279205DD2C180232EF1673D5192AD7'
		);
		expect(result.ok).toBe(true);
	});

	it('rejects a malformed address before touching the chain', async () => {
		const result = await validateSafeAccount(fakeSafe(), '0x1234', OWNER);
		expect(result).toMatchObject({ ok: false, reason: expect.stringMatching(/20-byte/) });
	});

	it('rejects an address with no contract code', async () => {
		const result = await validateSafeAccount(fakeSafe({ code: '0x' }), SAFE, OWNER);
		expect(result).toMatchObject({ ok: false, reason: expect.stringMatching(/No contract code/) });
	});

	it('rejects a threshold above 1 — Mode D is strictly 1-of-1', async () => {
		const result = await validateSafeAccount(
			fakeSafe({ owners: [OWNER, OTHER], threshold: 2 }),
			SAFE,
			OWNER
		);
		expect(result).toMatchObject({ ok: false, reason: expect.stringMatching(/threshold is 2/) });
	});

	it('rejects when the connected wallet is not an owner', async () => {
		const result = await validateSafeAccount(fakeSafe({ owners: [OTHER] }), SAFE, OWNER);
		expect(result).toMatchObject({ ok: false, reason: expect.stringMatching(/not an owner/) });
	});

	it('propagates transport failures instead of returning a verdict', async () => {
		const down: SafeReadTransport = {
			getCode: async () => {
				throw new Error('RPC eth_getCode failed: HTTP 503');
			},
			call: async () => {
				throw new Error('unreachable');
			}
		};
		await expect(validateSafeAccount(down, SAFE, OWNER)).rejects.toThrow(/503/);
	});
});
