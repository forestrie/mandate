import { describe, expect, it } from 'vitest';
import {
	buildDelegationCertificateKs256,
	verifyDelegationCertificateKs256,
	parseDelegationCertificate,
	UINT64_MAX,
	encodeIntKeyCbor,
	COSE_CRV,
	COSE_CRV_P256,
	COSE_KTY,
	COSE_KTY_EC2,
	COSE_X,
	COSE_Y,
	type DelegationInput
} from '@forestrie/delegation-cose';
import { secp256k1 } from '@noble/curves/secp256k1';
import { keccak_256 } from '@noble/hashes/sha3';
import type { PendingDelegation } from '$lib/coordinator/pending-delegation.js';
import { buildSubmitCertificateBodyFromCert } from '../../routes/delegations/submit-payload.js';
import {
	buildBrowserDelegationCertificate,
	pendingEntryToDelegationInput
} from './build-browser-delegation-certificate.js';
import type { SigningBackend } from './signing-backend.js';
import { bytesToBase64 } from './bytes.js';

const TEST_PRIVATE_KEY_HEX = '0000000000000000000000000000000000000000000000000000000000000001';

function testRootFromPrivateKey(privateKeyHex: string) {
	const sk = Uint8Array.from(Buffer.from(privateKeyHex, 'hex'));
	const pub = secp256k1.getPublicKey(sk, false);
	const rootSignerAddressBytes = keccak_256(pub.slice(1)).slice(-20);
	const rootSignerAddress = `0x${Buffer.from(rootSignerAddressBytes).toString('hex')}`;
	return { sk, rootSignerAddress, rootSignerAddressBytes };
}

async function generateDelegatedPublicKeyCbor(): Promise<Uint8Array> {
	const keyPair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
		'sign',
		'verify'
	]);
	const raw = new Uint8Array(await crypto.subtle.exportKey('raw', keyPair.publicKey));
	return encodeIntKeyCbor(
		new Map<number, unknown>([
			[COSE_KTY, COSE_KTY_EC2],
			[COSE_CRV, COSE_CRV_P256],
			[COSE_X, raw.slice(1, 33)],
			[COSE_Y, raw.slice(33, 65)]
		])
	);
}

class LocalKs256Backend implements SigningBackend {
	readonly kind = 'eoa' as const;

	constructor(private readonly sk: Uint8Array) {}

	isAvailable(): boolean {
		return true;
	}

	async signKs256SigStructure(sigStructureBytes: Uint8Array): Promise<Uint8Array> {
		const hash = keccak_256(sigStructureBytes);
		const sig = secp256k1.sign(hash, this.sk, { lowS: true });
		const compact = sig.toCompactRawBytes();
		const out = new Uint8Array(65);
		out.set(compact, 0);
		out[64] = sig.recovery ?? 0;
		return out;
	}
}

describe('buildBrowserDelegationCertificate', () => {
	it('assembles a certificate that verifies with verifyDelegationCertificateKs256', async () => {
		const root = testRootFromPrivateKey(TEST_PRIVATE_KEY_HEX);
		const delegatedPublicKeyCbor = await generateDelegatedPublicKeyCbor();
		const issuedAt = 1_700_000_100;
		const input: DelegationInput = {
			logIdHex32: 'b2c3d4e5f67890ab1234567890abcdef12',
			mmrStart: 1n,
			mmrEnd: 100n,
			delegatedPublicKeyCbor,
			issuedAt,
			expiresAt: issuedAt + 3600,
			delegationId: new Uint8Array(16).fill(0xcd),
			ttlSeconds: 3600
		};

		const certificate = await buildBrowserDelegationCertificate(
			input,
			root.rootSignerAddress,
			new LocalKs256Backend(root.sk)
		);

		await expect(
			verifyDelegationCertificateKs256(certificate, root.rootSignerAddressBytes)
		).resolves.toBe(true);
	});

	it('matches agent local-ks256-signer certificate bytes for fixed inputs', async () => {
		const root = testRootFromPrivateKey(TEST_PRIVATE_KEY_HEX);
		const delegatedPublicKeyCbor = await generateDelegatedPublicKeyCbor();
		const issuedAt = 1_700_000_200;
		const input: DelegationInput = {
			logIdHex32: 'c3d4e5f67890ab1234567890abcdef1234',
			mmrStart: 0n,
			mmrEnd: 10n,
			delegatedPublicKeyCbor,
			issuedAt,
			expiresAt: issuedAt + 3600,
			delegationId: new Uint8Array(16).fill(0xab),
			ttlSeconds: 3600
		};

		const agentStyle = await buildDelegationCertificateKs256(
			input,
			root.rootSignerAddressBytes,
			TEST_PRIVATE_KEY_HEX
		);
		const browserStyle = await buildBrowserDelegationCertificate(
			input,
			root.rootSignerAddress,
			new LocalKs256Backend(root.sk)
		);

		expect(bytesToBase64(browserStyle)).toBe(bytesToBase64(agentStyle));
	});
});

describe('pendingEntryToDelegationInput (FOR-612, FOR-613)', () => {
	function entry(window: { mmrStart: bigint; mmrEnd: bigint }): PendingDelegation {
		return {
			id: 'pending-1',
			authLogIdHex32: 'a'.repeat(32),
			logIdHex32: 'b'.repeat(32),
			delegatedPublicKeyHash: 'hash',
			delegatedPublicKey: 'ZGVsZWdhdGVkLWtleQ==',
			requestedAt: 1_700_000_000,
			...window
		};
	}

	// Signing exactly the demanded window made every later seal raise a new
	// demand: one owner signature per seal window.
	it('widens a demanded window to [0, mmrEnd + 65535]', () => {
		const input = pendingEntryToDelegationInput(
			entry({ mmrStart: 7n, mmrEnd: 21n }),
			1_700_000_000
		);
		expect([input.mmrStart, input.mmrEnd]).toEqual([0n, 21n + 65535n]);
	});

	// FOR-612 capped at 2^32-1 while delegation-cose 0.1.x (cbor-x) wrote
	// larger integers as float64; 0.5.0 encodes uint64 canonically.
	it('widens past uint32 without a cap', () => {
		const input = pendingEntryToDelegationInput(
			entry({ mmrStart: 0xffffff00n, mmrEnd: 0xfffffff0n }),
			1_700_000_000
		);
		expect([input.mmrStart, input.mmrEnd]).toEqual([0n, 0xfffffff0n + 65535n]);
	});

	it.each([
		['just below 2^64-1', UINT64_MAX - 10n],
		['at 2^64-1', UINT64_MAX]
	])('clamps the widened end at 2^64-1 when demanded %s', (_label, demandedEnd) => {
		const input = pendingEntryToDelegationInput(
			entry({ mmrStart: 0n, mmrEnd: demandedEnd }),
			1_700_000_000
		);
		expect([input.mmrStart, input.mmrEnd]).toEqual([0n, UINT64_MAX]);
	});
});

describe('sign, parse and submit round trip (FOR-613)', () => {
	it.each([
		['above 2^53', (1n << 53n) + 1n, (1n << 53n) + 1n + 65535n, '9007199254806528'],
		['clamped at 2^64-1', UINT64_MAX - 1n, UINT64_MAX, '18446744073709551615']
	])('keeps a window %s exact end to end', async (_label, demandedEnd, signedEnd, wireEnd) => {
		const root = testRootFromPrivateKey(TEST_PRIVATE_KEY_HEX);
		const delegatedPublicKeyCbor = await generateDelegatedPublicKeyCbor();
		const pending: PendingDelegation = {
			id: 'pending-big',
			authLogIdHex32: 'a'.repeat(32),
			logIdHex32: 'c'.repeat(32),
			mmrStart: demandedEnd - 5n,
			mmrEnd: demandedEnd,
			delegatedPublicKeyHash: 'hash',
			delegatedPublicKey: bytesToBase64(delegatedPublicKeyCbor),
			requestedAt: 1_700_000_000
		};

		const certificate = await buildBrowserDelegationCertificate(
			pendingEntryToDelegationInput(pending, 1_700_000_000),
			root.rootSignerAddress,
			new LocalKs256Backend(root.sk)
		);

		await expect(
			verifyDelegationCertificateKs256(certificate, root.rootSignerAddressBytes)
		).resolves.toBe(true);
		const info = parseDelegationCertificate(certificate);
		expect([info.mmrStart, info.mmrEnd]).toEqual([0n, signedEnd]);
		const body = buildSubmitCertificateBodyFromCert(pending, certificate);
		expect([body.mmrStart, body.mmrEnd]).toEqual(['0', wireEnd]);
		expect(BigInt(body.mmrEnd)).toBe(signedEnd);
	});
});
