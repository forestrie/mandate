import { secp256k1 } from '@noble/curves/secp256k1';
import { keccak_256 } from '@noble/hashes/sha3';
import {
	COSE_CRV,
	COSE_CRV_P256,
	COSE_KTY,
	COSE_KTY_EC2,
	COSE_X,
	COSE_Y,
	verifyDelegationCertificateKs256,
	encodeIntKeyCbor
} from '@forestrie/delegation-cose';
import type { DelegationRequiredEvent } from '@mandate/coordinator-types';
import { bytesToBase64 } from '../src/bytes.js';
import type { WebhookJwk } from '../src/webhook/jwks-resolver.js';

export const TEST_LOG_ID = 'b2c3d4e5f67890ab1234567890abcdef';

export interface TestKs256Root {
	privateKeyHex: string;
	rootSignerAddress: string;
	rootSignerAddressBytes: Uint8Array;
}

export async function generateTestKs256Root(): Promise<TestKs256Root> {
	const sk = secp256k1.utils.randomPrivateKey();
	const pub = secp256k1.getPublicKey(sk, false);
	const rootSignerAddressBytes = keccak_256(pub.slice(1)).slice(-20);
	const rootSignerAddress = `0x${Buffer.from(rootSignerAddressBytes).toString('hex')}` as const;
	return {
		privateKeyHex: Buffer.from(sk).toString('hex'),
		rootSignerAddress,
		rootSignerAddressBytes
	};
}

export async function generateDelegatedPublicKeyCbor(): Promise<Uint8Array> {
	const keyPair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
		'sign',
		'verify'
	])) as CryptoKeyPair;
	const raw = new Uint8Array(
		(await crypto.subtle.exportKey('raw', keyPair.publicKey)) as ArrayBuffer
	);
	return encodeIntKeyCbor(
		new Map<number, unknown>([
			[COSE_KTY, COSE_KTY_EC2],
			[COSE_CRV, COSE_CRV_P256],
			[COSE_X, raw.slice(1, 33)],
			[COSE_Y, raw.slice(33, 65)]
		])
	);
}

export async function generateWebhookSigningKeyPair(): Promise<{
	privateKey: CryptoKey;
	publicJwk: WebhookJwk;
}> {
	const keyPair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
		'sign',
		'verify'
	])) as CryptoKeyPair;
	const publicJwk = (await crypto.subtle.exportKey('jwk', keyPair.publicKey)) as JsonWebKey;
	const kid = 'test-webhook-kid';
	return {
		privateKey: keyPair.privateKey,
		publicJwk: {
			kid,
			alg: 'ES256',
			use: 'sig',
			kty: 'EC',
			crv: 'P-256',
			x: publicJwk.x!,
			y: publicJwk.y!
		}
	};
}

export async function signWebhookBody(
	privateKey: CryptoKey,
	timestamp: string,
	rawBody: string
): Promise<string> {
	const signature = await crypto.subtle.sign(
		{ name: 'ECDSA', hash: 'SHA-256' },
		privateKey,
		new TextEncoder().encode(`${timestamp}.${rawBody}`)
	);
	return bytesToBase64Url(new Uint8Array(signature));
}

function bytesToBase64Url(data: Uint8Array): string {
	return bytesToBase64(data).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function buildDelegationRequiredEvent(opts: {
	root: TestKs256Root;
	delegatedPublicKeyCbor: Uint8Array;
	materialSubmitUrl?: string;
	requestKey?: string;
	logId?: string;
	authLogId?: string;
}): DelegationRequiredEvent {
	const delegatedPublicKey = bytesToBase64(opts.delegatedPublicKeyCbor);
	const logId = opts.logId ?? TEST_LOG_ID;
	return {
		requestKey: opts.requestKey ?? 'test-request-key',
		type: 'delegation.required',
		version: 1,
		logId,
		authLogId: opts.authLogId ?? logId,
		mmrStart: 1,
		mmrEnd: 8,
		delegatedPublicKey,
		requestedAt: 1_700_000_000,
		materialSubmitUrl: opts.materialSubmitUrl ?? 'http://coordinator.test/api/delegations/certificate',
		certificateSubmitUrl:
			opts.certificateSubmitUrl ??
			opts.materialSubmitUrl ??
			'http://coordinator.test/api/delegations/certificate'
	};
}

export async function assertCertificateVerifies(
	certificateB64: string,
	rootSignerAddressBytes: Uint8Array
): Promise<void> {
	const certificate = Uint8Array.from(atob(certificateB64), (c) => c.charCodeAt(0));
	const ok = await verifyDelegationCertificateKs256(certificate, rootSignerAddressBytes);
	if (!ok) throw new Error('certificate verification failed');
}
