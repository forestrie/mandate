import { describe, expect, it } from 'vitest';
import {
	buildDelegationCertificateKs256WithSigner,
	type DelegationInput
} from '@forestrie/delegation-cose';
import { secp256k1 } from '@noble/curves/secp256k1';
import { keccak_256 } from '@noble/hashes/sha3';
import {
	assertCertificateMatchesEvent,
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

describe('assertCertificateMatchesEvent', () => {
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
			assertCertificateMatchesEvent({
				certificate,
				event: { logId: TEST_LOG_ID, mmrStart: 1, mmrEnd: 8 },
				rootSignerAddress: root.rootSignerAddress
			})
		).resolves.toBeUndefined();
	});

	it('rejects when event mmrEnd does not match certificate', async () => {
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
			assertCertificateMatchesEvent({
				certificate,
				event: { logId: TEST_LOG_ID, mmrStart: 1, mmrEnd: 99 },
				rootSignerAddress: root.rootSignerAddress
			})
		).rejects.toThrow(CertificateValidationError);
	});
});
