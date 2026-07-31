import {
	ALG_KS256,
	buildImutableDeploymentData,
	buildSafeTxFields,
	computeSafeTxHash,
	DEFAULT_CREATE_CALL,
	DEFAULT_SAFE_TX_SERVICE_URL,
	encodePerformCreate2Calldata,
	ks256AddressToKey,
	postSafeTransaction,
	predictCreate2Address,
	safeBatchSaltAtIndex,
	SafeServiceError,
	type SafeTxFields
} from '@forestrie/deploy-core';
import { bytesToHex, type Address, type Hex } from 'viem';
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
export async function proposeSafeDeployment(input: {
	provider: EthereumProvider;
	transport: SafeReadTransport;
	ownerAddress: string;
	chainId: number;
	plan: Pick<DeployPlan, 'safeAddress' | 'createCall' | 'salt' | 'deploymentData'>;
	serviceUrl?: string;
}): Promise<ProposeDeploymentResult> {
	const safe = input.plan.safeAddress as Address;
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
		params: [
			input.ownerAddress,
			buildSafeTxTypedDataJson(tx, input.chainId, input.plan.safeAddress)
		]
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
			sender: input.ownerAddress as Address,
			signature,
			origin: 'mandate console /onboard'
		});
	} catch (error) {
		if (error instanceof SafeServiceError) {
			return { safeTxHash, nonce, proposed: false, stsDetail: error.message };
		}
		throw error;
	}
	return { safeTxHash, nonce, proposed: true };
}
