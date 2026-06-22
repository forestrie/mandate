import { createPublicKey } from 'node:crypto';
import { keccak_256 } from '@noble/hashes/sha3';
import {
	base64ToBytes,
	bytesToBase64,
	derToRecoverableSignature,
	hashSigStructure,
	signToDer
} from './sig-utils.js';
import type { SignerBackend } from './harness.js';

export interface GcpKmsBackendConfig {
	keyName: string;
	accessToken: string;
	expectedAddress: Uint8Array;
	fetchImpl?: typeof fetch;
}

/**
 * Mock GCP KMS path: sign locally, DER-encode, then run DER→recoverable conversion
 * (the novel code path KMS live signing requires).
 */
export function createGcpKmsMockBackend(
	privateKey: Uint8Array,
	expectedAddress: Uint8Array
): SignerBackend {
	return async (sigStructureBytes) => {
		const hash = hashSigStructure(sigStructureBytes);
		const der = signToDer(hash, privateKey);
		return derToRecoverableSignature(der, hash, expectedAddress);
	};
}

export function createGcpKmsLiveBackend(config: GcpKmsBackendConfig): SignerBackend {
	const fetchImpl = config.fetchImpl ?? fetch;

	return async (sigStructureBytes) => {
		const hash = hashSigStructure(sigStructureBytes);
		const url = `https://cloudkms.googleapis.com/v1/${config.keyName}:asymmetricSign`;
		const response = await fetchImpl(url, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${config.accessToken}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				digest: {
					sha256: bytesToBase64(hash)
				}
			})
		});

		if (!response.ok) {
			const detail = await response.text();
			throw new Error(`KMS asymmetricSign failed: ${response.status} ${detail}`);
		}

		const body = (await response.json()) as { signature?: string };
		if (!body.signature) {
			throw new Error('KMS response missing signature');
		}
		const der = base64ToBytes(body.signature);
		return derToRecoverableSignature(der, hash, config.expectedAddress);
	};
}

export function gcpKmsEnvConfigured(): boolean {
	return Boolean(process.env.GCP_KMS_KEY_NAME && process.env.GCP_ACCESS_TOKEN);
}

export function createGcpKmsBackendFromEnv(
	privateKeyForMock: Uint8Array,
	expectedAddress: Uint8Array
): { mode: 'mock' | 'live'; backend: SignerBackend } {
	if (process.env.SPIKE_LIVE === '1' && gcpKmsEnvConfigured()) {
		return {
			mode: 'live',
			backend: createGcpKmsLiveBackend({
				keyName: process.env.GCP_KMS_KEY_NAME!,
				accessToken: process.env.GCP_ACCESS_TOKEN!,
				expectedAddress
			})
		};
	}
	return {
		mode: 'mock',
		backend: createGcpKmsMockBackend(privateKeyForMock, expectedAddress)
	};
}

/** Fetch KMS public key PEM and derive Ethereum address (live bootstrap helper). */
export async function fetchKmsEthereumAddress(opts: {
	keyName: string;
	accessToken: string;
	fetchImpl?: typeof fetch;
}): Promise<Uint8Array> {
	const fetchImpl = opts.fetchImpl ?? fetch;
	const url = `https://cloudkms.googleapis.com/v1/${opts.keyName}/publicKey`;
	const response = await fetchImpl(url, {
		headers: { Authorization: `Bearer ${opts.accessToken}` }
	});
	if (!response.ok) {
		throw new Error(`KMS getPublicKey failed: ${response.status}`);
	}
	const body = (await response.json()) as { pem?: string };
	if (!body.pem) throw new Error('KMS public key missing pem');
	return ethereumAddressFromKmsPem(body.pem);
}

function ethereumAddressFromKmsPem(pem: string): Uint8Array {
	const key = createPublicKey(pem);
	const spki = key.export({ type: 'spki', format: 'der' });
	const uncompressed = spki.subarray(-65);
	return keccak_256(uncompressed.slice(1)).slice(-20);
}
