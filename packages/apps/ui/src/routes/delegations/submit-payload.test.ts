import { describe, expect, it } from 'vitest';
import {
	buildDelegationCertificateKs256,
	encodeIntKeyCbor,
	COSE_CRV,
	COSE_CRV_P256,
	COSE_KTY,
	COSE_KTY_EC2,
	COSE_X,
	COSE_Y
} from '@forestrie/delegation-cose';
import { secp256k1 } from '@noble/curves/secp256k1';
import { keccak_256 } from '@noble/hashes/sha3';
import type { PendingEntry } from '@mandate/coordinator-types';
import {
	buildSubmitCertificateBody,
	buildSubmitCertificateBodyFromCert
} from './submit-payload.js';

const ZERO_BYTES_B64 = Buffer.alloc(32).toString('base64');

function pendingEntry(overrides: Partial<PendingEntry> = {}): PendingEntry {
	return {
		id: 'pending-1',
		authLogIdHex32: 'a'.repeat(32),
		logIdHex32: 'b'.repeat(32),
		mmrStart: 0,
		mmrEnd: 4,
		delegatedPublicKeyHash: 'hash',
		delegatedPublicKey: 'ZGVsZWdhdGVkLWtleQ==',
		requestedAt: 1_700_000_000,
		...overrides
	};
}

describe('buildSubmitCertificateBody', () => {
	it('uses entry.delegatedPublicKey, not zero bytes', () => {
		const entry = pendingEntry({ delegatedPublicKey: 'ZGVsZWdhdGVkLWtleQ==' });
		const body = buildSubmitCertificateBody(entry, 'cert-bytes', 1_700_000_100);

		expect(body.delegatedPublicKey).toBe(entry.delegatedPublicKey);
		expect(body.delegatedPublicKey).not.toBe(ZERO_BYTES_B64);
		expect(body.logId).toBe(entry.logIdHex32);
		expect(body.mmrStart).toBe(entry.mmrStart);
		expect(body.mmrEnd).toBe(entry.mmrEnd);
		expect(body.certificate).toBe('cert-bytes');
		expect(body.issuedAt).toBe(1_700_000_100);
		expect(body.expiresAt).toBe(1_700_000_100 + 86400);
	});
});

describe('buildSubmitCertificateBodyFromCert', () => {
	it('aligns issuedAt and expiresAt with COSE payload (FOR-198)', async () => {
		const sk = secp256k1.utils.randomPrivateKey();
		const pub = secp256k1.getPublicKey(sk, false);
		const rootSignerAddress = keccak_256(pub.slice(1)).slice(-20);
		const keyPair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
			'sign',
			'verify'
		]);
		const raw = new Uint8Array(await crypto.subtle.exportKey('raw', keyPair.publicKey));
		const delegatedPublicKeyCbor = encodeIntKeyCbor(
			new Map<number, unknown>([
				[COSE_KTY, COSE_KTY_EC2],
				[COSE_CRV, COSE_CRV_P256],
				[COSE_X, raw.slice(1, 33)],
				[COSE_Y, raw.slice(33, 65)]
			])
		);
		const issuedAt = 1_700_000_300;
		const certificate = await buildDelegationCertificateKs256(
			{
				logIdHex32: 'b'.repeat(32),
				mmrStart: 0,
				mmrEnd: 4,
				delegatedPublicKeyCbor,
				issuedAt,
				expiresAt: issuedAt + 3600,
				ttlSeconds: 3600
			},
			rootSignerAddress,
			Buffer.from(sk).toString('hex')
		);
		const entry = pendingEntry({
			delegatedPublicKey: Buffer.from(delegatedPublicKeyCbor).toString('base64')
		});
		const body = buildSubmitCertificateBodyFromCert(entry, certificate);
		expect(body.issuedAt).toBe(issuedAt);
		expect(body.expiresAt).toBe(issuedAt + 3600);
		expect(body.expiresAt - body.issuedAt).toBe(3600);
	});
});
