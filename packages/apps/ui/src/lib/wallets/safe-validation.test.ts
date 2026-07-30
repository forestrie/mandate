import { describe, expect, it, vi } from 'vitest';
import type { SafeReadTransport } from './safe-validation.js';
import {
	SafeReadRevertError,
	isSupportedSafeVersion,
	providerTransport,
	rpcTransport,
	validateSafeAccount
} from './safe-validation.js';

const SAFE = '0xCdD289cC5420529d1C4D0498FA3DaAb549A07a63';
const OWNER = '0x242382c2b4279205dd2c180232ef1673d5192ad7';
const OTHER = `0x${'99'.repeat(20)}`;

const GET_OWNERS = '0xa0e67e2b';
const GET_THRESHOLD = '0xe75235b8';
const GET_VERSION = '0xffa1ad74';

function word(value: bigint | number): string {
	return BigInt(value).toString(16).padStart(64, '0');
}

function addressWord(address: string): string {
	return address.replace(/^0x/, '').toLowerCase().padStart(64, '0');
}

function encodeOwners(owners: string[]): string {
	return `0x${word(0x20)}${word(owners.length)}${owners.map(addressWord).join('')}`;
}

function encodeAbiString(value: string): string {
	let dataHex = '';
	for (const ch of value) dataHex += ch.charCodeAt(0).toString(16).padStart(2, '0');
	const padded = dataHex.padEnd(Math.ceil(dataHex.length / 64) * 64, '0');
	return `0x${word(0x20)}${word(value.length)}${padded}`;
}

function fakeSafe({
	owners = [OWNER],
	threshold = 1,
	code = '0x600160005260206000f3',
	version = '1.4.1',
	chainId = 84532
}: {
	owners?: string[];
	threshold?: number;
	code?: string;
	version?: string;
	chainId?: number;
} = {}): SafeReadTransport {
	return {
		async getCode(address) {
			expect(address).toBe(SAFE);
			return code;
		},
		async call(to, data) {
			expect(to).toBe(SAFE);
			if (data === GET_VERSION) return encodeAbiString(version);
			if (data === GET_OWNERS) return encodeOwners(owners);
			if (data === GET_THRESHOLD) return `0x${word(threshold)}`;
			throw new Error(`unexpected calldata ${data}`);
		},
		async chainId() {
			return chainId;
		}
	};
}

describe('validateSafeAccount', () => {
	it('accepts a deployed >=1.3.0 1-of-1 Safe owned by the connected wallet', async () => {
		const result = await validateSafeAccount(fakeSafe(), SAFE, OWNER);
		expect(result).toEqual({
			ok: true,
			owners: [OWNER.toLowerCase()],
			threshold: 1,
			version: '1.4.1'
		});
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

	it('rejects pre-1.3.0 Safes that cannot validate SafeMessages (plan-2607-04 R2)', async () => {
		for (const version of ['1.1.1', '1.2.0', '0.1.0']) {
			const result = await validateSafeAccount(fakeSafe({ version }), SAFE, OWNER);
			expect(result).toMatchObject({
				ok: false,
				reason: expect.stringContaining(`Safe version ${version} is not supported`)
			});
		}
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

	it('a contract REVERT is an invalid verdict, not unavailability (plan-2607-04 R4)', async () => {
		const notASafe: SafeReadTransport = {
			getCode: async () => '0x600160005260206000f3',
			call: async (_to, data) => {
				throw new SafeReadRevertError('eth_call', `execution reverted for ${data}`);
			},
			chainId: async () => 84532
		};
		const result = await validateSafeAccount(notASafe, SAFE, OWNER);
		expect(result).toMatchObject({
			ok: false,
			reason: expect.stringMatching(/does not answer like a Safe/)
		});
	});

	it('propagates transport failures instead of returning a verdict', async () => {
		const down: SafeReadTransport = {
			getCode: async () => {
				throw new Error('RPC eth_getCode failed: HTTP 503');
			},
			call: async () => {
				throw new Error('unreachable');
			},
			chainId: async () => 84532
		};
		await expect(validateSafeAccount(down, SAFE, OWNER)).rejects.toThrow(/503/);
	});
});

describe('isSupportedSafeVersion', () => {
	it('gates on >= 1.3.0', () => {
		for (const good of ['1.3.0', '1.4.1', '2.0.0', '1.4.1-libs.0']) {
			expect(isSupportedSafeVersion(good)).toBe(true);
		}
		for (const bad of ['1.2.0', '1.1.1', '0.9.9', 'garbage', '']) {
			expect(isSupportedSafeVersion(bad)).toBe(false);
		}
	});
});

describe('transport revert classification (plan-2607-04 R4)', () => {
	it('rpcTransport: JSON-RPC execution revert throws SafeReadRevertError', async () => {
		const fetchImpl = vi.fn(
			async () =>
				new Response(
					JSON.stringify({
						jsonrpc: '2.0',
						id: 1,
						error: { code: 3, message: 'execution reverted' }
					}),
					{ status: 200 }
				)
		) as unknown as typeof fetch;
		const transport = rpcTransport('https://rpc.test', fetchImpl);
		await expect(transport.call(SAFE, GET_OWNERS)).rejects.toBeInstanceOf(SafeReadRevertError);
	});

	it('rpcTransport: HTTP failures stay plain (unavailable) errors', async () => {
		const fetchImpl = vi.fn(
			async () => new Response('bad gateway', { status: 502 })
		) as unknown as typeof fetch;
		const transport = rpcTransport('https://rpc.test', fetchImpl);
		const failure = await transport.call(SAFE, GET_OWNERS).catch((e: unknown) => e);
		expect(failure).toBeInstanceOf(Error);
		expect(failure).not.toBeInstanceOf(SafeReadRevertError);
	});

	it('rpcTransport: answers eth_chainId as a number', async () => {
		const fetchImpl = vi.fn(
			async () =>
				new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: '0x14a34' }), {
					status: 200
				})
		) as unknown as typeof fetch;
		await expect(rpcTransport('https://rpc.test', fetchImpl).chainId()).resolves.toBe(84532);
	});

	it('providerTransport: EIP-1193 revert-shaped errors classify as reverts', async () => {
		const provider = {
			request: async ({ method }: { method: string }) => {
				if (method === 'eth_call') {
					throw Object.assign(new Error('execution reverted'), { code: 3 });
				}
				return '0x14a34';
			}
		};
		const transport = providerTransport(provider);
		await expect(transport.call(SAFE, GET_OWNERS)).rejects.toBeInstanceOf(SafeReadRevertError);
		await expect(transport.chainId()).resolves.toBe(84532);
	});
});
