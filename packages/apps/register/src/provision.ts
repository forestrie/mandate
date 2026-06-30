import { randomUUID } from 'node:crypto';
import { onboardModeCWallet, PrivyRestClient } from '@mandate/privy-admin';
import { COSE_ALG_KS256 } from './cose-alg.js';
import { parseEthAddressToBytes, parseUnivocityAddrHex } from './eth-address.js';
import { buildGenesisCborBody } from './genesis-request.js';
import { postGenesis } from './genesis-client.js';
import { logIdFromR, logIdPaddedWire32, normalizeForestR } from './log-id.js';
import type { ProvisionConfig } from './provision-config.js';
import type { ProvisionResult } from './provision-result.js';
import { GenesisClientError } from './genesis-client-error.js';

function buildModeBDescriptors(
	logIdHex32: string,
	input: NonNullable<ProvisionConfig['modeB']>
): ProvisionResult['descriptors'] {
	const keyRef = input.keyRef;
	return {
		keyDirectory: {},
		operatorRootKeys: {
			[logIdHex32]: {
				alg: 'KS256',
				rootSignerAddress: input.rootSignerAddress,
				kind: 'remote',
				signerUrl: input.userSignerUrl,
				keyRef,
				bearerEnvKey: 'USER_SIGNER_BEARER'
			}
		}
	};
}

/**
 * Provision a payment-authoritative forest instance and emit agent/signer descriptors.
 * Mode C: Privy onboard → genesis with wallet address as KS256 bootstrapKey.
 * Mode B: genesis with user root address; descriptor points at user signerUrl (FOR-111).
 */
export async function provisionInstance(config: ProvisionConfig): Promise<ProvisionResult> {
	const forestR = config.forestR ? normalizeForestR(config.forestR) : randomUUID();
	const logIdHex32 = logIdFromR(forestR);
	const univocityAddr = parseUnivocityAddrHex(config.univocityAddr);
	const fetchImpl = config.fetchImpl;

	let bootstrapKey: Uint8Array;
	let descriptors: ProvisionResult['descriptors'];

	if (config.mode === 'C') {
		const modeC = config.modeC;
		if (!modeC) {
			throw new Error('mode C provisioning requires modeC inputs');
		}
		const keyRef = modeC.keyRef ?? 'user-log-wallet';
		const client = new PrivyRestClient({
			appId: modeC.appId,
			appSecret: modeC.appSecret,
			apiBase: modeC.apiBase
		});
		const onboard = await onboardModeCWallet(client, {
			walletId: modeC.walletId,
			mandateSignerId: modeC.mandateSignerId,
			keyRef,
			logId: logIdHex32,
			signerUrl: modeC.signerUrl,
			ownerAuthorizationKey: modeC.ownerAuthorizationKey,
			policyId: modeC.policyId
		});
		bootstrapKey = parseEthAddressToBytes(onboard.walletAddress);
		descriptors = {
			keyDirectory: onboard.keyDirectory as ProvisionResult['descriptors']['keyDirectory'],
			operatorRootKeys: onboard.operatorRootKeys
		};
	} else if (config.mode === 'B') {
		const modeB = config.modeB;
		if (!modeB) {
			throw new Error('mode B provisioning requires modeB inputs');
		}
		bootstrapKey = parseEthAddressToBytes(modeB.rootSignerAddress);
		descriptors = buildModeBDescriptors(logIdHex32, modeB);
	} else {
		throw new Error(`unsupported delegation mode: ${config.mode as string}`);
	}

	const uupsGenesisExtras =
		config.univocityVariant === 'uups-counterfactual'
			? {
					univocityVariant: 'uups-counterfactual' as const,
					univocityDeployer: parseEthAddressToBytes(
						config.univocityDeployer ??
							(() => {
								throw new Error('uups-counterfactual provisioning requires univocityDeployer');
							})()
					),
					bootstrapLogId: logIdPaddedWire32(logIdHex32)
				}
			: {};

	const body = buildGenesisCborBody({
		genesisAlg: COSE_ALG_KS256,
		bootstrapKey,
		univocityAddr,
		chainId: config.chainId,
		...uupsGenesisExtras
	});

	let genesis;
	try {
		genesis = await postGenesis({
			forestR,
			body,
			onboardToken: config.onboardToken,
			webhookUrl: config.agentWebhookUrl,
			canopyBaseUrl: config.canopyBaseUrl,
			fetchImpl
		});
	} catch (error) {
		if (error instanceof GenesisClientError) {
			throw error;
		}
		throw error;
	}

	const coordinator = genesis.coordinator;
	if (!coordinator) {
		throw new GenesisClientError('genesis succeeded but coordinator status missing');
	}

	return {
		forestR,
		logIdHex32,
		mode: config.mode,
		genesis,
		descriptors,
		coordinator
	};
}
