import { describe, expect, it, vi, afterEach } from 'vitest';
import {
	concatHex,
	encodeAbiParameters,
	hashTypedData,
	keccak256,
	toHex,
	type Hex,
	type TypedDataDefinition
} from 'viem';
import {
	buildSafeTxFields,
	computeSafeTxHash,
	defaultSafeBatchSalt,
	DEFAULT_CREATE_CALL,
	encodePerformCreate2Calldata,
	predictCreate2Address,
	predictImutableFromPerformCreate2,
	safeBatchSaltAtIndex
} from '@forestrie/deploy-core';
import type { SafeReadTransport } from '$lib/wallets/safe-validation.js';
import {
	buildDeployPlan,
	buildSafeTxTypedDataJson,
	executeSafeDeployment,
	proposeSafeDeployment,
	readSafeNonce,
	SAFE_EXECUTION_FAILURE_TOPIC,
	SafeExecutionRevertedError
} from './deploy-plan.js';

const SAFE_ADDRESS = '0xCdD289cC5420529d1C4D0498FA3DaAb549A07a63';
const OWNER_ADDRESS = '0x242382c2b4279205dd2c180232ef1673d5192ad7';
// EIP-55 forms the STS demands (it 422s lowercase address fields).
const OWNER_ADDRESS_CHECKSUMMED = '0x242382C2B4279205Dd2C180232eF1673d5192AD7';
const CHAIN_ID = 84532;
const BYTECODE = '0x600160005260206000f3' as Hex;

// Vendored from safe-contracts (Safe >= 1.3.0): the typehashes the deployed
// Safe hashes execTransaction checks against. Drift between our typed-data
// JSON and these means the wallet signs a digest the Safe never accepts.
const DOMAIN_SEPARATOR_TYPEHASH =
	'0x47e79534a245952e8b16893a336b85a3d9ea9fa8c573f3d803afb92a79469218';
const SAFE_TX_TYPEHASH = '0xbb8310d486368db6bd6f849402fdd73ad53d316b5a4b2644ad6efe0f941286d8';

function plan() {
	return buildDeployPlan({
		safeAddress: SAFE_ADDRESS,
		releaseTag: 'v0.1.8',
		instanceIndex: 0,
		bytecode: BYTECODE
	});
}

describe('buildDeployPlan', () => {
	it('index 0 uses the default Safe batch salt — existing deployments keep their address', () => {
		expect(plan().salt).toBe(defaultSafeBatchSalt(SAFE_ADDRESS));
		expect(
			buildDeployPlan({
				safeAddress: SAFE_ADDRESS,
				releaseTag: 'v0.1.8',
				instanceIndex: 3,
				bytecode: BYTECODE
			}).salt
		).toBe(safeBatchSaltAtIndex(SAFE_ADDRESS, 3));
	});

	it('embeds the Safe as the ks256 bootstrap key in the initcode', () => {
		const built = plan();
		expect(built.deploymentData.startsWith(BYTECODE)).toBe(true);
		expect(built.deploymentData).toContain(SAFE_ADDRESS.slice(2).toLowerCase());
	});

	it('round-trips salt/prediction through the slice-01 primitives', () => {
		const built = plan();
		expect(built.predictedAddress).toBe(
			predictCreate2Address(DEFAULT_CREATE_CALL, built.salt, built.deploymentData)
		);
		// The calldata the proposal carries decodes back to the same prediction.
		const calldata = encodePerformCreate2Calldata(built.deploymentData, built.salt);
		expect(predictImutableFromPerformCreate2(DEFAULT_CREATE_CALL, calldata)).toBe(
			built.predictedAddress
		);
	});

	it('is deterministic and index-sensitive', () => {
		expect(plan()).toEqual(plan());
		const bumped = buildDeployPlan({
			safeAddress: SAFE_ADDRESS,
			releaseTag: 'v0.1.8',
			instanceIndex: 1,
			bytecode: BYTECODE
		});
		expect(bumped.predictedAddress).not.toBe(plan().predictedAddress);
	});
});

describe('buildSafeTxTypedDataJson', () => {
	const tx = buildSafeTxFields({
		to: DEFAULT_CREATE_CALL,
		data: '0x4847be6f' as Hex,
		operation: 0,
		nonce: 7n
	});

	it('uses the exact Safe type strings the vendored typehashes commit to', () => {
		expect(keccak256(toHex('EIP712Domain(uint256 chainId,address verifyingContract)'))).toBe(
			DOMAIN_SEPARATOR_TYPEHASH
		);
		expect(
			keccak256(
				toHex(
					'SafeTx(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,uint256 nonce)'
				)
			)
		).toBe(SAFE_TX_TYPEHASH);
	});

	it('hashes to the digest the Safe recomputes in checkSignatures (== computeSafeTxHash)', () => {
		const typedData = JSON.parse(
			buildSafeTxTypedDataJson(tx, CHAIN_ID, SAFE_ADDRESS)
		) as TypedDataDefinition;
		const domainSeparator = keccak256(
			encodeAbiParameters(
				[{ type: 'bytes32' }, { type: 'uint256' }, { type: 'address' }],
				[DOMAIN_SEPARATOR_TYPEHASH, BigInt(CHAIN_ID), SAFE_ADDRESS]
			)
		);
		const structHash = keccak256(
			encodeAbiParameters(
				[
					{ type: 'bytes32' },
					{ type: 'address' },
					{ type: 'uint256' },
					{ type: 'bytes32' },
					{ type: 'uint8' },
					{ type: 'uint256' },
					{ type: 'uint256' },
					{ type: 'uint256' },
					{ type: 'address' },
					{ type: 'address' },
					{ type: 'uint256' }
				],
				[
					SAFE_TX_TYPEHASH,
					tx.to,
					tx.value,
					keccak256(tx.data),
					tx.operation,
					tx.safeTxGas,
					tx.baseGas,
					tx.gasPrice,
					tx.gasToken,
					tx.refundReceiver,
					tx.nonce
				]
			)
		);
		const manualDigest = keccak256(concatHex(['0x1901', domainSeparator, structHash]));
		expect(hashTypedData(typedData)).toBe(manualDigest);
		expect(computeSafeTxHash(CHAIN_ID, SAFE_ADDRESS, tx)).toBe(manualDigest);
	});
});

function fakeTransport(nonceWord: string): SafeReadTransport {
	return {
		call: vi.fn(async (_to: string, data: string) => {
			if (data === '0xaffed0e0') return nonceWord;
			throw new Error(`unexpected call ${data}`);
		}),
		getCode: vi.fn(async () => '0x'),
		chainId: vi.fn(async () => CHAIN_ID)
	};
}

describe('readSafeNonce', () => {
	it('decodes the uint256 word', async () => {
		await expect(readSafeNonce(fakeTransport(`0x${'0'.repeat(63)}5`), SAFE_ADDRESS)).resolves.toBe(
			5n
		);
	});
});

describe('proposeSafeDeployment', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	const signature = `0x${'11'.repeat(32)}${'22'.repeat(32)}1b`;

	function fakeProvider(recorded: Array<{ method: string; params: unknown[] }>) {
		return {
			request: vi.fn(async ({ method, params }: { method: string; params?: unknown[] }) => {
				recorded.push({ method, params: params ?? [] });
				if (method === 'eth_signTypedData_v4') return signature;
				throw new Error(`unexpected method ${method}`);
			})
		};
	}

	it('signs the SafeTx domain and posts the proposal to the gateway', async () => {
		const requests: Array<{ method: string; params: unknown[] }> = [];
		const posts: Array<{ url: string; body: Record<string, unknown> }> = [];
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
				posts.push({ url: String(url), body: JSON.parse(String(init?.body)) });
				return new Response('', { status: 201 });
			})
		);
		const built = plan();
		const result = await proposeSafeDeployment({
			provider: fakeProvider(requests),
			transport: fakeTransport(`0x${'0'.repeat(64)}`),
			ownerAddress: OWNER_ADDRESS,
			chainId: CHAIN_ID,
			plan: built
		});

		expect(result.proposed).toBe(true);
		expect(result.nonce).toBe(0n);
		// The lifted signature is returned for local keeping — the execute leg
		// packs it without ever consulting the STS (Q5).
		expect(result.ownerSignature).toBe(signature);
		const tx = buildSafeTxFields({
			to: built.createCall,
			data: encodePerformCreate2Calldata(built.deploymentData, built.salt),
			operation: 0,
			nonce: 0n
		});
		expect(result.safeTxHash).toBe(computeSafeTxHash(CHAIN_ID, SAFE_ADDRESS, tx));

		// The wallet signed OUR SafeTx typed data, addressed to the owner.
		expect(requests).toHaveLength(1);
		expect(requests[0]!.params[0]).toBe(OWNER_ADDRESS);
		const typedData = JSON.parse(requests[0]!.params[1] as string) as {
			primaryType: string;
			domain: { verifyingContract: string };
		};
		expect(typedData.primaryType).toBe('SafeTx');
		expect(typedData.domain.verifyingContract).toBe(SAFE_ADDRESS);

		// The gateway got the matching contractTransactionHash and a
		// checksummed sender — wallets report lowercase, the STS 422s it
		// ("Address … is not checksumed", live dogfood 2026-07-31).
		expect(posts).toHaveLength(1);
		expect(posts[0]!.url).toBe(
			`https://api.safe.global/tx-service/basesep/api/v1/safes/${SAFE_ADDRESS}/multisig-transactions/`
		);
		expect(posts[0]!.body).toMatchObject({
			contractTransactionHash: result.safeTxHash,
			sender: OWNER_ADDRESS_CHECKSUMMED,
			signature,
			operation: 0,
			nonce: '0'
		});
	});

	it('checksums a lowercase Safe address into the URL and typed-data domain', async () => {
		const requests: Array<{ method: string; params: unknown[] }> = [];
		const posts: Array<{ url: string }> = [];
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: RequestInfo | URL) => {
				posts.push({ url: String(url) });
				return new Response('', { status: 201 });
			})
		);
		const built = plan();
		await proposeSafeDeployment({
			provider: fakeProvider(requests),
			transport: fakeTransport(`0x${'0'.repeat(64)}`),
			ownerAddress: OWNER_ADDRESS,
			chainId: CHAIN_ID,
			plan: { ...built, safeAddress: built.safeAddress.toLowerCase() }
		});
		expect(posts[0]!.url).toContain(`/safes/${SAFE_ADDRESS}/`);
		const typedData = JSON.parse(requests[0]!.params[1] as string) as {
			domain: { verifyingContract: string };
		};
		expect(typedData.domain.verifyingContract).toBe(SAFE_ADDRESS);
	});

	it('reports STS unavailability as a non-fatal result — propose is best-effort (Q5)', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response('upstream down', { status: 503 }))
		);
		const result = await proposeSafeDeployment({
			provider: fakeProvider([]),
			transport: fakeTransport(`0x${'0'.repeat(64)}`),
			ownerAddress: OWNER_ADDRESS,
			chainId: CHAIN_ID,
			plan: plan()
		});
		expect(result.proposed).toBe(false);
		expect(result.stsDetail).toMatch(/unavailable|503/);
	});

	it('propagates a wallet signing refusal — that IS fatal to the action', async () => {
		vi.stubGlobal('fetch', vi.fn());
		const provider = {
			request: vi.fn(async () => {
				throw new Error('User rejected the request');
			})
		};
		await expect(
			proposeSafeDeployment({
				provider,
				transport: fakeTransport(`0x${'0'.repeat(64)}`),
				ownerAddress: OWNER_ADDRESS,
				chainId: CHAIN_ID,
				plan: plan()
			})
		).rejects.toThrow(/User rejected/);
		expect(fetch).not.toHaveBeenCalled();
	});

	it('lifts a v=0/1 wallet signature to the 27/28 flavour the STS demands', async () => {
		const posts: Array<Record<string, unknown>> = [];
		vi.stubGlobal(
			'fetch',
			vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
				posts.push(JSON.parse(String(init?.body)));
				return new Response('', { status: 201 });
			})
		);
		const provider = {
			request: vi.fn(async () => `0x${'11'.repeat(32)}${'22'.repeat(32)}00`)
		};
		await proposeSafeDeployment({
			provider,
			transport: fakeTransport(`0x${'0'.repeat(64)}`),
			ownerAddress: OWNER_ADDRESS,
			chainId: CHAIN_ID,
			plan: plan()
		});
		expect(posts[0]!.signature).toBe(`0x${'11'.repeat(32)}${'22'.repeat(32)}1b`);
	});
});

describe('executeSafeDeployment', () => {
	const ownerSignature = `0x${'11'.repeat(32)}${'22'.repeat(32)}1b` as Hex;
	const txHash = `0x${'e2ec'.repeat(16)}` as Hex;
	/** `execTransaction` — the Safe interface selector. */
	const EXEC_SELECTOR = '0x6a761202';

	function execProvider(
		recorded: Array<{ method: string; params: unknown[] }>,
		overrides: Partial<Record<string, () => unknown>> = {}
	) {
		return {
			request: vi.fn(async ({ method, params }: { method: string; params?: unknown[] }) => {
				recorded.push({ method, params: params ?? [] });
				const override = overrides[method];
				if (override) return override();
				if (method === 'eth_estimateGas') return '0x30000';
				if (method === 'eth_sendTransaction') return txHash;
				if (method === 'eth_getTransactionReceipt') return { status: '0x1', logs: [] };
				throw new Error(`unexpected method ${method}`);
			})
		};
	}

	function execute(
		provider: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> },
		overrides: { nonce?: bigint; currentNonceWord?: string } = {}
	) {
		return executeSafeDeployment({
			provider,
			transport: fakeTransport(overrides.currentNonceWord ?? `0x${'0'.repeat(64)}`),
			ownerAddress: OWNER_ADDRESS,
			plan: plan(),
			nonce: overrides.nonce ?? 0n,
			ownerSignature,
			receiptDelayMs: 1,
			delay: async () => {}
		});
	}

	it('pins the vendored Safe ExecutionFailure topic', () => {
		expect(SAFE_EXECUTION_FAILURE_TOPIC).toBe(
			keccak256(toHex('ExecutionFailure(bytes32,uint256)'))
		);
	});

	it('estimates, sends execTransaction from the owner to the Safe, and waits for the receipt', async () => {
		const requests: Array<{ method: string; params: unknown[] }> = [];
		const result = await execute(execProvider(requests));
		expect(result.txHash).toBe(txHash);
		expect(requests.map((r) => r.method)).toEqual([
			'eth_estimateGas',
			'eth_sendTransaction',
			'eth_getTransactionReceipt'
		]);
		const [sent] = (requests[1]!.params ?? []) as [
			{ from: string; to: string; data: string; gas: string }
		];
		expect(sent.from).toBe(OWNER_ADDRESS);
		// The tx HAS a `to` — the Safe — so wallets treat it as a normal
		// contract interaction (the MetaMask no-`to` failure never applies).
		expect(sent.to).toBe(SAFE_ADDRESS);
		expect(sent.gas).toBe('0x30000');
		expect(sent.data.startsWith(EXEC_SELECTOR)).toBe(true);
		// The packed owner signature rides in the calldata.
		expect(sent.data).toContain(ownerSignature.slice(2));
		// … wrapping the performCreate2 call for the planned salt.
		expect(sent.data).toContain(plan().salt.slice(2));
	});

	it('refuses to execute once the Safe nonce has advanced past the signature', async () => {
		const requests: Array<{ method: string; params: unknown[] }> = [];
		await expect(
			execute(execProvider(requests), { currentNonceWord: `0x${'0'.repeat(63)}2` })
		).rejects.toThrow(/nonce has advanced.*Re-propose/);
		expect(requests).toHaveLength(0);
	});

	it('surfaces a gas-estimation refusal as the Safe refusing the execution', async () => {
		const requests: Array<{ method: string; params: unknown[] }> = [];
		const provider = execProvider(requests, {
			eth_estimateGas: () => {
				throw new Error('execution reverted: GS026');
			}
		});
		await expect(execute(provider)).rejects.toThrow(SafeExecutionRevertedError);
		await expect(execute(provider)).rejects.toThrow(/would revert.*GS026/);
		expect(requests.filter((r) => r.method === 'eth_sendTransaction')).toHaveLength(0);
	});

	it('propagates the owner declining the transaction', async () => {
		const provider = execProvider([], {
			eth_sendTransaction: () => {
				throw new Error('User rejected the request');
			}
		});
		await expect(execute(provider)).rejects.toThrow(/User rejected/);
	});

	it('reports an on-chain revert of the execution transaction honestly', async () => {
		const provider = execProvider([], {
			eth_getTransactionReceipt: () => ({ status: '0x0', logs: [] })
		});
		await expect(execute(provider)).rejects.toThrow(/reverted on-chain/);
	});

	it('reports a mined-but-failed execution via the ExecutionFailure event', async () => {
		const provider = execProvider([], {
			eth_getTransactionReceipt: () => ({
				status: '0x1',
				logs: [{ topics: [SAFE_EXECUTION_FAILURE_TOPIC] }]
			})
		});
		await expect(execute(provider)).rejects.toThrow(/ExecutionFailure/);
	});

	it('polls until the receipt lands', async () => {
		let polls = 0;
		const delays: number[] = [];
		const provider = execProvider([], {
			eth_getTransactionReceipt: () => (++polls < 3 ? null : { status: '0x1', logs: [] })
		});
		const result = await executeSafeDeployment({
			provider,
			transport: fakeTransport(`0x${'0'.repeat(64)}`),
			ownerAddress: OWNER_ADDRESS,
			plan: plan(),
			nonce: 0n,
			ownerSignature,
			receiptDelayMs: 5,
			delay: async (ms) => {
				delays.push(ms);
			}
		});
		expect(result.txHash).toBe(txHash);
		expect(polls).toBe(3);
		expect(delays).toEqual([5, 5]);
	});
});
