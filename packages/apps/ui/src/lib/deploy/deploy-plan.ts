import {
	ALG_KS256,
	buildImutableDeploymentData,
	buildSafeTxFields,
	computeSafeTxHash,
	DEFAULT_CREATE_CALL,
	DEFAULT_SAFE_TX_SERVICE_URL,
	defaultDelay,
	encodePerformCreate2Calldata,
	ks256AddressToKey,
	packSafeSignatures,
	postSafeTransaction,
	predictCreate2Address,
	safeBatchSaltAtIndex,
	SafeServiceError,
	type DelayFn,
	type SafeTxFields
} from '@forestrie/deploy-core';
import { bytesToHex, encodeFunctionData, getAddress, type Address, type Hex } from 'viem';
import type { EthereumProvider } from '$lib/privy/client.js';
import type { SafeReadTransport } from '$lib/wallets/safe-validation.js';
import { safeOwnerSignatureBytes } from '$lib/signing/safe-backend.js';

/**
 * Inline Safe deploy for the /onboard wizard (plan-2607-47 slice 02,
 * ADR-0060): predict the CREATE2 address for an ImutableUnivocity whose
 * bootstrap key is the connected 1-of-1 Safe (ks256 pinned — Mode D), and
 * propose the deployment as a SafeTx. The proposal is a plain CALL to the
 * shared CreateCall library (`performCreate2`), so the wallet sees a normal
 * contract interaction — structurally avoiding the MetaMask no-`to`
 * contract-creation failure that motivated this plan.
 *
 * Signing uses the SafeTx EIP-712 domain directly on the owner wallet — NOT
 * the SafeMessage envelope the SigningBackend seam wraps around KS256
 * digests. The backends' wire-bytes seam is deliberately untouched: a SafeTx
 * is a Safe-native transaction authorisation, not a COSE payload signature.
 */

/** `nonce()` — Safe interface selector. */
const SAFE_NONCE_SELECTOR = '0xaffed0e0';

export interface DeployPlan {
	/** The Safe the salt and bootstrap key are bound to. */
	safeAddress: string;
	releaseTag: string;
	instanceIndex: number;
	salt: Hex;
	predictedAddress: Address;
	/** CreateCall library the SafeTx targets. */
	createCall: Address;
	/** Initcode: creation bytecode ‖ abi.encode(ALG_KS256, safe-address key). */
	deploymentData: Hex;
}

/**
 * Deterministic plan: same Safe + same release + same index ⇒ same predicted
 * address (Q6) — code at the predicted address is the resume fast-path, and
 * an accidental identical re-deploy reverts instead of duplicating.
 */
export function buildDeployPlan(input: {
	safeAddress: string;
	releaseTag: string;
	instanceIndex: number;
	bytecode: Hex;
}): DeployPlan {
	const safe = input.safeAddress as Address;
	const deploymentData = buildImutableDeploymentData(
		input.bytecode,
		ALG_KS256,
		ks256AddressToKey(input.safeAddress)
	);
	const salt = safeBatchSaltAtIndex(safe, input.instanceIndex);
	return {
		safeAddress: input.safeAddress,
		releaseTag: input.releaseTag,
		instanceIndex: input.instanceIndex,
		salt,
		predictedAddress: predictCreate2Address(DEFAULT_CREATE_CALL, salt, deploymentData),
		createCall: DEFAULT_CREATE_CALL,
		deploymentData
	};
}

/**
 * The EIP-712 payload `eth_signTypedData_v4` takes for a SafeTx (Safe >=
 * 1.3.0 domain: chainId + verifyingContract only). uint256 values ride as
 * decimal strings — the JSON shape wallets expect.
 */
export function buildSafeTxTypedDataJson(
	tx: SafeTxFields,
	chainId: number,
	safeAddress: string
): string {
	return JSON.stringify({
		domain: { chainId, verifyingContract: safeAddress },
		types: {
			EIP712Domain: [
				{ name: 'chainId', type: 'uint256' },
				{ name: 'verifyingContract', type: 'address' }
			],
			SafeTx: [
				{ name: 'to', type: 'address' },
				{ name: 'value', type: 'uint256' },
				{ name: 'data', type: 'bytes' },
				{ name: 'operation', type: 'uint8' },
				{ name: 'safeTxGas', type: 'uint256' },
				{ name: 'baseGas', type: 'uint256' },
				{ name: 'gasPrice', type: 'uint256' },
				{ name: 'gasToken', type: 'address' },
				{ name: 'refundReceiver', type: 'address' },
				{ name: 'nonce', type: 'uint256' }
			]
		},
		primaryType: 'SafeTx',
		message: {
			to: tx.to,
			value: tx.value.toString(),
			data: tx.data,
			operation: String(tx.operation),
			safeTxGas: tx.safeTxGas.toString(),
			baseGas: tx.baseGas.toString(),
			gasPrice: tx.gasPrice.toString(),
			gasToken: tx.gasToken,
			refundReceiver: tx.refundReceiver,
			nonce: tx.nonce.toString()
		}
	});
}

/** Read the Safe's current nonce over the validation read seam. */
export async function readSafeNonce(
	transport: SafeReadTransport,
	safeAddress: string
): Promise<bigint> {
	return BigInt(await transport.call(safeAddress, SAFE_NONCE_SELECTOR));
}

export interface ProposeDeploymentResult {
	safeTxHash: Hex;
	nonce: bigint;
	/**
	 * The 27/28-lifted owner signature over the SafeTx. Held locally (and
	 * persisted with the plan) so BOTH execution legs work without the STS:
	 * inline `execTransaction` packs it, and re-proposing is never required
	 * just because the service was down (Q5).
	 */
	ownerSignature: Hex;
	/** True when the Safe Transaction Service accepted the proposal. */
	proposed: boolean;
	/**
	 * STS failure detail when `proposed` is false. Propose is best-effort
	 * (Q5): the owner signature exists locally, so execution never
	 * hard-depends on the service.
	 */
	stsDetail?: string;
}

/**
 * Build, sign and propose the deployment SafeTx. Wallet refusal (the owner
 * declining the signature) throws; STS trouble does NOT — it is reported in
 * the result so the wizard can warn and carry on.
 */
/**
 * The STS checksum-validates every address field (422 otherwise), while
 * wallets and pasted input commonly carry lowercase — normalise to EIP-55
 * at the service boundary. Lowercasing first keeps mixed-case input from
 * tripping viem's own checksum assertion.
 */
function checksummedAddress(address: string): Address {
	return getAddress(address.toLowerCase());
}

export async function proposeSafeDeployment(input: {
	provider: EthereumProvider;
	transport: SafeReadTransport;
	ownerAddress: string;
	chainId: number;
	plan: Pick<DeployPlan, 'safeAddress' | 'createCall' | 'salt' | 'deploymentData'>;
	serviceUrl?: string;
}): Promise<ProposeDeploymentResult> {
	const safe = checksummedAddress(input.plan.safeAddress);
	const nonce = await readSafeNonce(input.transport, input.plan.safeAddress);
	const tx = buildSafeTxFields({
		to: input.plan.createCall,
		data: encodePerformCreate2Calldata(input.plan.deploymentData, input.plan.salt),
		operation: 0,
		nonce
	});
	const safeTxHash = computeSafeTxHash(input.chainId, safe, tx);

	const signatureRaw = (await input.provider.request({
		method: 'eth_signTypedData_v4',
		params: [input.ownerAddress, buildSafeTxTypedDataJson(tx, input.chainId, safe)]
	})) as string;
	if (typeof signatureRaw !== 'string' || !signatureRaw.startsWith('0x')) {
		throw new Error('Wallet returned an invalid SafeTx signature');
	}
	// Same 27/28 lift as the SafeMessage owner blob: STS rejects v ∈ {0,1}
	// EIP-712 owner signatures.
	const signature = bytesToHex(safeOwnerSignatureBytes(signatureRaw));

	try {
		await postSafeTransaction({
			serviceUrl: input.serviceUrl ?? DEFAULT_SAFE_TX_SERVICE_URL,
			chainId: input.chainId,
			safe,
			tx,
			safeTxHash,
			sender: checksummedAddress(input.ownerAddress),
			signature,
			origin: 'mandate console /onboard'
		});
	} catch (error) {
		if (error instanceof SafeServiceError) {
			return {
				safeTxHash,
				nonce,
				ownerSignature: signature,
				proposed: false,
				stsDetail: error.message
			};
		}
		throw error;
	}
	return { safeTxHash, nonce, ownerSignature: signature, proposed: true };
}

/** `Safe.execTransaction` — the inline execution leg's call target. */
const SAFE_EXEC_TRANSACTION_ABI = [
	{
		type: 'function',
		name: 'execTransaction',
		stateMutability: 'payable',
		inputs: [
			{ name: 'to', type: 'address' },
			{ name: 'value', type: 'uint256' },
			{ name: 'data', type: 'bytes' },
			{ name: 'operation', type: 'uint8' },
			{ name: 'safeTxGas', type: 'uint256' },
			{ name: 'baseGas', type: 'uint256' },
			{ name: 'gasPrice', type: 'uint256' },
			{ name: 'gasToken', type: 'address' },
			{ name: 'refundReceiver', type: 'address' },
			{ name: 'signatures', type: 'bytes' }
		],
		outputs: [{ name: 'success', type: 'bool' }]
	}
] as const;

/**
 * keccak256("ExecutionFailure(bytes32,uint256)") — with zero safeTxGas the
 * Safe requires the inner call to succeed, but a legacy Safe (or a gas-limited
 * execution) can complete the OUTER transaction while the inner deployment
 * reverted; the honest signal is this event in the receipt.
 */
export const SAFE_EXECUTION_FAILURE_TOPIC =
	'0x23428b18acfb3ea64b08dc0c1d296ea9c09702c09083ca5272e64d115b687d23';

/** The execution definitively did not deploy — distinct from "still waiting". */
export class SafeExecutionRevertedError extends Error {
	constructor(
		message: string,
		readonly txHash?: Hex
	) {
		super(message);
		this.name = 'SafeExecutionRevertedError';
	}
}

interface ExecutionReceipt {
	status?: string;
	logs?: Array<{ topics?: string[] }>;
}

export interface ExecuteDeploymentResult {
	/** Hash of the owner's execution transaction. */
	txHash: Hex;
}

/**
 * Inline execution leg (Q5, slice 03): pack the locally held owner signature
 * and send `Safe.execTransaction` from the connected owner — the console's
 * first `eth_sendTransaction`. The call has a `to` (the Safe), structurally
 * avoiding the MetaMask no-`to` contract-creation failure. Never touches the
 * Safe Transaction Service.
 *
 * Failures are surfaced honestly, never retried here: gas estimation refusal
 * means the Safe would revert (stale nonce, bad signature, or the deployment
 * already landed — the caller's code-at-address check disambiguates the happy
 * case), wallet refusal propagates, and a mined-but-failed execution throws
 * `SafeExecutionRevertedError`.
 */
export async function executeSafeDeployment(input: {
	provider: EthereumProvider;
	transport: SafeReadTransport;
	ownerAddress: string;
	plan: Pick<DeployPlan, 'safeAddress' | 'createCall' | 'salt' | 'deploymentData'>;
	/** The nonce the persisted signature covers. */
	nonce: bigint;
	/** The 27/28 owner signature recorded at propose time. */
	ownerSignature: Hex;
	receiptAttempts?: number;
	receiptDelayMs?: number;
	delay?: DelayFn;
}): Promise<ExecuteDeploymentResult> {
	// The signature commits to the nonce: once the Safe has moved past it the
	// recorded SafeTx can never execute, so say that instead of letting the
	// wallet surface an opaque GS025/GS026 revert.
	const currentNonce = await readSafeNonce(input.transport, input.plan.safeAddress);
	if (currentNonce !== input.nonce) {
		throw new Error(
			`The Safe's nonce has advanced (signed at nonce ${input.nonce}, now ${currentNonce}) — the recorded signature can no longer execute. Re-propose to sign a fresh transaction.`
		);
	}
	const tx = buildSafeTxFields({
		to: input.plan.createCall,
		data: encodePerformCreate2Calldata(input.plan.deploymentData, input.plan.salt),
		operation: 0,
		nonce: input.nonce
	});
	const call = {
		from: input.ownerAddress,
		to: input.plan.safeAddress,
		data: encodeFunctionData({
			abi: SAFE_EXEC_TRANSACTION_ABI,
			functionName: 'execTransaction',
			args: [
				tx.to,
				tx.value,
				tx.data,
				tx.operation,
				tx.safeTxGas,
				tx.baseGas,
				tx.gasPrice,
				tx.gasToken,
				tx.refundReceiver,
				packSafeSignatures([
					{ owner: input.ownerAddress as Address, signature: input.ownerSignature }
				])
			]
		})
	};

	let gas: string;
	try {
		gas = (await input.provider.request({ method: 'eth_estimateGas', params: [call] })) as string;
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		throw new SafeExecutionRevertedError(
			`Gas estimation failed — the Safe would revert this execution: ${detail}`
		);
	}

	// Wallet refusal (the owner declining the transaction) propagates as-is.
	const txHash = (await input.provider.request({
		method: 'eth_sendTransaction',
		params: [{ ...call, gas }]
	})) as Hex;
	if (typeof txHash !== 'string' || !txHash.startsWith('0x')) {
		throw new Error('Wallet returned an invalid transaction hash');
	}

	const attempts = input.receiptAttempts ?? 60;
	const delay = input.delay ?? defaultDelay;
	for (let attempt = 0; attempt < attempts; attempt++) {
		const receipt = (await input.provider.request({
			method: 'eth_getTransactionReceipt',
			params: [txHash]
		})) as ExecutionReceipt | null;
		if (receipt) {
			if (Number.parseInt(receipt.status ?? '0x0', 16) !== 1) {
				throw new SafeExecutionRevertedError(
					`The execution transaction reverted on-chain (${txHash}) — nothing was deployed.`,
					txHash
				);
			}
			const executionFailed = receipt.logs?.some(
				(log) => log.topics?.[0]?.toLowerCase() === SAFE_EXECUTION_FAILURE_TOPIC
			);
			if (executionFailed) {
				throw new SafeExecutionRevertedError(
					`The Safe reported ExecutionFailure (${txHash}) — the deployment inside the transaction reverted.`,
					txHash
				);
			}
			return { txHash };
		}
		await delay(input.receiptDelayMs ?? 2000);
	}
	throw new Error(
		`Timed out waiting for the execution receipt (${txHash}). The transaction may still land — the wizard keeps watching the predicted address.`
	);
}
