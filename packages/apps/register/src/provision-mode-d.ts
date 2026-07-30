import { COSE_ALG_KS256 } from './cose-alg.js';
import { parseEthAddressToBytes, parseUnivocityAddrHex } from './eth-address.js';
import { buildGenesisCborBody } from './genesis-request.js';
import { postGenesis } from './genesis-client.js';
import { GenesisClientError } from './genesis-client-error.js';
import { logIdFromR, normalizeForestR } from './log-id.js';
import type { ProvisionConfig, ProvisionDescriptors } from './provision-config.js';
import type { GenesisRegistrationResponse } from './genesis-registration-response.js';
import { ReservationConflictError } from './reservation-conflict-error.js';
import { univocityInstanceIdFromChainBinding } from './univocity-instance-id.js';

/**
 * Safe 1x1 (Mode D) descriptors: an interactive root has NO signerUrl and no
 * keyRef — the root signs in the console (ADR-0005 addendum). The agent's
 * KeyRegistry refuses to resolve a signer for `kind: 'interactive'`, and the
 * coordinator's pending queue (signing-route) carries the demand until the
 * owner signs.
 */
export function buildModeDDescriptors(
	logIdHex32: string,
	input: NonNullable<ProvisionConfig['modeD']>
): ProvisionDescriptors {
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
 * Browser-safe Safe 1x1 (Mode D) genesis. Unlike `provisionInstance` this is
 * isomorphic pure code (no node:crypto, no Privy): the caller supplies
 * `forestR` (browser: `crypto.randomUUID()`), and NO agent webhook is
 * registered — an interactive root signs in the console, so the pending
 * queue is the delivery surface (FOR-504's suppression is the coordinator
 * side of the same rule).
 */
export interface ModeDGenesisConfig {
	onboardToken: string;
	canopyBaseUrl: string;
	/** Univocity contract address, `0x`-prefixed or bare 40-hex. */
	univocityAddr: string;
	/** Decimal chain id string, e.g. `"84532"`. */
	chainId: string;
	/** The 1-of-1 Safe contract address — becomes the KS256 bootstrapKey. */
	safeAddress: string;
	/** Caller-generated forest R (UUID). */
	forestR: string;
	fetchImpl?: typeof fetch;
}

export interface ModeDGenesisResult {
	forestR: string;
	logIdHex32: string;
	univocityInstanceId: string;
	genesis: GenesisRegistrationResponse;
	descriptors: ProvisionDescriptors;
}

export async function provisionModeDGenesis(
	config: ModeDGenesisConfig
): Promise<ModeDGenesisResult> {
	const forestR = normalizeForestR(config.forestR);
	const logIdHex32 = logIdFromR(forestR);
	const bootstrapKey = parseEthAddressToBytes(config.safeAddress);
	const univocityAddr = parseUnivocityAddrHex(config.univocityAddr);

	const body = buildGenesisCborBody({
		genesisAlg: COSE_ALG_KS256,
		bootstrapKey,
		univocityAddr,
		chainId: config.chainId
	});

	// The account identity this provisioning claims (ADR-0059): derived up
	// front so a reservation conflict can name it before genesis succeeds.
	const univocityInstanceId = univocityInstanceIdFromChainBinding({
		chainId: config.chainId,
		univocityAddr: config.univocityAddr
	});

	let genesis: GenesisRegistrationResponse;
	try {
		genesis = await postGenesis({
			forestR,
			body,
			onboardToken: config.onboardToken,
			canopyBaseUrl: config.canopyBaseUrl,
			fetchImpl: config.fetchImpl
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

	return {
		forestR,
		logIdHex32,
		univocityInstanceId,
		genesis,
		descriptors: buildModeDDescriptors(logIdHex32, { safeAddress: config.safeAddress })
	};
}
