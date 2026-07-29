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
import { ReservationConflictError } from './reservation-conflict-error.js';
import { univocityInstanceIdFromChainBinding } from './univocity-instance-id.js';

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
 * Safe 1x1 (Mode D) descriptors: an interactive root has NO signerUrl and no
 * keyRef — the root signs in the console (ADR-0005 addendum). The agent's
 * KeyRegistry refuses to resolve a signer for `kind: 'interactive'`, and the
 * coordinator's pending queue (signing-route) carries the demand until the
 * owner signs.
 */
function buildModeDDescriptors(
	logIdHex32: string,
	input: NonNullable<ProvisionConfig['modeD']>
): ProvisionResult['descriptors'] {
	return {
		keyDirectory: {},
		operatorRootKeys: {
			[logIdHex32]: {
				alg: 'KS256',
				rootSignerAddress: input.safeAddress,
				kind: 'interactive'
			}
		}
	};
}

/**
 * Provision a forest instance — its root is its own fee account (ADR-0059)
 * — and emit agent/signer descriptors.
 * Mode C: Privy onboard → genesis with wallet address as KS256 bootstrapKey.
 * Mode B: genesis with user root address; descriptor points at user signerUrl (FOR-111).
 * Mode D: genesis with the 1-of-1 Safe address (ERC-1271 under KS256,
 * univocity plan-0029); interactive descriptor, no signer service.
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
	} else if (config.mode === 'D') {
		const modeD = config.modeD;
		if (!modeD) {
			throw new Error('mode D provisioning requires modeD inputs');
		}
		bootstrapKey = parseEthAddressToBytes(modeD.safeAddress);
		descriptors = buildModeDDescriptors(logIdHex32, modeD);
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

	// The account identity this provisioning claims (ADR-0059): derived up
	// front so a reservation conflict can name it before genesis succeeds.
	const univocityInstanceId = univocityInstanceIdFromChainBinding({
		chainId: config.chainId,
		univocityAddr: config.univocityAddr
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
		// D7 reservation conflict: the instance is held by a foreign admission
		// or registered to another root. Genesis retries for the SAME root are
		// idempotent server-side and do not land here.
		if (error instanceof GenesisClientError && error.status === 409) {
			throw new ReservationConflictError(
				univocityInstanceId,
				error.detail?.trim() || error.message
			);
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
		univocityInstanceId,
		genesis,
		descriptors,
		coordinator
	};
}
