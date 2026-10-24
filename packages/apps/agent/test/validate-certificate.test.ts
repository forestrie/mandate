import { describe, expect, it } from 'vitest';
import {
	buildDelegationCertificateKs256WithSigner,
	type DelegationInput
} from '@forestrie/delegation-cose';
import { secp256k1 } from '@noble/curves/secp256k1';
import { keccak_256 } from '@noble/hashes/sha3';
import { bytesToBase64 } from '../src/bytes.js';
import {
	assertCertificateCoversEvent,
	CertificateValidationError
} from '../src/delegation/validate-certificate.js';
import { generateDelegatedPublicKeyCbor, TEST_LOG_ID } from './test-helpers.js';

function testRoot() {
	const sk = secp256k1.utils.randomPrivateKey();
	const pub = secp256k1.getPublicKey(sk, false);
	const rootSignerAddressBytes = keccak_256(pub.slice(1)).slice(-20);
	const rootSignerAddress = `0x${Buffer.from(rootSignerAddressBytes).toString('hex')}`;
	return { sk, rootSignerAddress, rootSignerAddressBytes };
}

async function buildTestCertificate(
	root: ReturnType<typeof testRoot>,
	input: DelegationInput
): Promise<Uint8Array> {
	return buildDelegationCertificateKs256WithSigner(
		input,
		root.rootSignerAddressBytes,
		(sigStructure) => {
			const hash = keccak_256(sigStructure);
			const sig = secp256k1.sign(hash, root.sk, { lowS: true });
			const compact = sig.toCompactRawBytes();
			return new Uint8Array([...compact, sig.recovery]);
		}
	);
}

describe('assertCertificateCoversEvent', () => {
	it('accepts a valid certificate bound to the event', async () => {
		const root = testRoot();
		const delegatedPublicKeyCbor = await generateDelegatedPublicKeyCbor();
		const input: DelegationInput = {
			logIdHex32: TEST_LOG_ID,
			mmrStart: 1,
			mmrEnd: 8,
			delegatedPublicKeyCbor,
			ttlSeconds: 3600
		};
		const certificate = await buildTestCertificate(root, input);
		await expect(
			assertCertificateCoversEvent({
				certificate,
				event: {
					logId: TEST_LOG_ID,
					mmrStart: 1,
					mmrEnd: 8,
					delegatedPublicKey: bytesToBase64(delegatedPublicKeyCbor)
				},
				rootSignerAddress: root.rootSignerAddress
			})
		).resolves.toBeUndefined();
	});

	it('rejects when event delegatedPublicKey does not match certificate', async () => {
		const root = testRoot();
		const delegatedPublicKeyCbor = await generateDelegatedPublicKeyCbor();
		const otherDelegatedPublicKeyCbor = await generateDelegatedPublicKeyCbor();
		const input: DelegationInput = {
			logIdHex32: TEST_LOG_ID,
			mmrStart: 1,
			mmrEnd: 8,
			delegatedPublicKeyCbor,
			ttlSeconds: 3600
		};
		const certificate = await buildTestCertificate(root, input);
		await expect(
			assertCertificateCoversEvent({
				certificate,
				event: {
					logId: TEST_LOG_ID,
					mmrStart: 1,
					mmrEnd: 8,
					delegatedPublicKey: bytesToBase64(otherDelegatedPublicKeyCbor)
				},
				rootSignerAddress: root.rootSignerAddress
			})
		).rejects.toThrow(CertificateValidationError);
	});

	it('rejects a certificate that ends before the demanded window', async () => {
		const root = testRoot();
		const delegatedPublicKeyCbor = await generateDelegatedPublicKeyCbor();
		const input: DelegationInput = {
			logIdHex32: TEST_LOG_ID,
			mmrStart: 1,
			mmrEnd: 8,
			delegatedPublicKeyCbor,
			ttlSeconds: 3600
		};
		const certificate = await buildTestCertificate(root, input);
		await expect(
			assertCertificateCoversEvent({
				certificate,
				event: {
					logId: TEST_LOG_ID,
					mmrStart: 1,
					mmrEnd: 99,
					delegatedPublicKey: bytesToBase64(delegatedPublicKeyCbor)
				},
				rootSignerAddress: root.rootSignerAddress
			})
		).rejects.toThrow(CertificateValidationError);
	});

	it('accepts a certificate that covers a narrower demanded window', async () => {
		const root = testRoot();
		const delegatedPublicKeyCbor = await generateDelegatedPublicKeyCbor();
		const certificate = await buildTestCertificate(root, {
			logIdHex32: TEST_LOG_ID,
			mmrStart: 0,
			mmrEnd: 21 + 65535,
			delegatedPublicKeyCbor,
			ttlSeconds: 3600
		});
		await expect(
			assertCertificateCoversEvent({
				certificate,
				event: {
					logId: TEST_LOG_ID,
					mmrStart: 7,
					mmrEnd: 21,
					delegatedPublicKey: bytesToBase64(delegatedPublicKeyCbor)
				},
				rootSignerAddress: root.rootSignerAddress
			})
		).resolves.toBeUndefined();
	});

	it('rejects a certificate that starts after the demanded window', async () => {
		const root = testRoot();
		const delegatedPublicKeyCbor = await generateDelegatedPublicKeyCbor();
		const certificate = await buildTestCertificate(root, {
			logIdHex32: TEST_LOG_ID,
			mmrStart: 8,
			mmrEnd: 100,
			delegatedPublicKeyCbor,
			ttlSeconds: 3600
		});
		await expect(
			assertCertificateCoversEvent({
				certificate,
				event: {
					logId: TEST_LOG_ID,
					mmrStart: 7,
					mmrEnd: 21,
					delegatedPublicKey: bytesToBase64(delegatedPublicKeyCbor)
				},
				rootSignerAddress: root.rootSignerAddress
			})
		).rejects.toThrow(CertificateValidationError);
	});

	it('accepts any range for a window-less event', async () => {
		const root = testRoot();
		const delegatedPublicKeyCbor = await generateDelegatedPublicKeyCbor();
		const certificate = await buildTestCertificate(root, {
			logIdHex32: TEST_LOG_ID,
			mmrStart: 0,
			mmrEnd: 65535,
			delegatedPublicKeyCbor,
			ttlSeconds: 3600
		});
		await expect(
			assertCertificateCoversEvent({
				certificate,
				event: {
					logId: TEST_LOG_ID,
					delegatedPublicKey: bytesToBase64(delegatedPublicKeyCbor)
				},
				rootSignerAddress: root.rootSignerAddress
			})
		).resolves.toBeUndefined();
	});
});
