import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
	verifyDelegationCertificateKs256,
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
import { buildBrowserDelegationCertificate } from './build-browser-delegation-certificate.js';

// Burner store + backend are browser-only; run them as if in the browser with a
// minimal localStorage double.
vi.mock('$app/environment', () => ({ browser: true }));

class MemoryStorage {
	private map = new Map<string, string>();
	getItem(key: string) {
		return this.map.has(key) ? this.map.get(key)! : null;
	}
	setItem(key: string, value: string) {
		this.map.set(key, value);
	}
	removeItem(key: string) {
		this.map.delete(key);
	}
}

const TEST_PRIVATE_KEY_HEX = '0000000000000000000000000000000000000000000000000000000000000001';

function addressFromPrivateKey(privateKeyHex: string): string {
	const sk = Uint8Array.from(Buffer.from(privateKeyHex, 'hex'));
	const pub = secp256k1.getPublicKey(sk, false);
	const addr = keccak_256(pub.slice(1)).slice(-20);
	return `0x${Buffer.from(addr).toString('hex')}`;
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

beforeEach(() => {
	vi.stubGlobal('window', { localStorage: new MemoryStorage() });
});

describe('LocalBurnerBackend', () => {
	it('is unavailable until a key exists, then available', async () => {
		const { hasBurnerKey, createBurnerKey } = await import('./local-burner-key.js');
		const { LocalBurnerBackend } = await import('./local-burner-backend.js');
		const backend = new LocalBurnerBackend();
		expect(hasBurnerKey()).toBe(false);
		expect(backend.isAvailable()).toBe(false);
		createBurnerKey();
		expect(backend.isAvailable()).toBe(true);
	});

	it('derives a stable address and round-trips import/export', async () => {
		const { importBurnerKey, exportBurnerKeyHex, getBurnerAddress, burnerAddressFromKeyHex } =
			await import('./local-burner-key.js');
		importBurnerKey(`0x${TEST_PRIVATE_KEY_HEX}`);
		expect(exportBurnerKeyHex()).toBe(`0x${TEST_PRIVATE_KEY_HEX}`);
		expect(getBurnerAddress()).toBe(addressFromPrivateKey(TEST_PRIVATE_KEY_HEX));
		expect(burnerAddressFromKeyHex(`0x${TEST_PRIVATE_KEY_HEX}`)).toBe(
			addressFromPrivateKey(TEST_PRIVATE_KEY_HEX)
		);
	});

	it('rejects malformed keys', async () => {
		const { importBurnerKey } = await import('./local-burner-key.js');
		expect(() => importBurnerKey('0xnothex')).toThrow();
		expect(() => importBurnerKey('0x1234')).toThrow();
	});

	it('signs a certificate that verifies against the burner address', async () => {
		const { importBurnerKey, getBurnerAddress } = await import('./local-burner-key.js');
		const { LocalBurnerBackend } = await import('./local-burner-backend.js');
		importBurnerKey(`0x${TEST_PRIVATE_KEY_HEX}`);
		const address = getBurnerAddress()!;
		const addressBytes = Uint8Array.from(Buffer.from(address.replace(/^0x/, ''), 'hex'));

		const issuedAt = 1_700_000_300;
		const input: DelegationInput = {
			logIdHex32: 'd4e5f67890ab1234567890abcdef123456',
			mmrStart: 5,
			mmrEnd: 42,
			delegatedPublicKeyCbor: await generateDelegatedPublicKeyCbor(),
			issuedAt,
			expiresAt: issuedAt + 3600,
			delegationId: new Uint8Array(16).fill(0xbe),
			ttlSeconds: 3600
		};

		const certificate = await buildBrowserDelegationCertificate(
			input,
			address,
			new LocalBurnerBackend()
		);

		await expect(verifyDelegationCertificateKs256(certificate, addressBytes)).resolves.toBe(true);
	});
});
