import { describe, expect, it } from 'vitest';
import { KeyRegistry } from '../src/signer/key-registry.js';
import { handleRootKeyConfig, timingSafeEqualString } from '../src/ops/handle-root-key-config.js';

const LOCAL_LOG_ID = 'a1b2c3d4a1b2c3d4a1b2c3d4a1b2c3d4a1b2c3d4a1b2c3d4a1b2c3d4a1b2c3d4';
const REMOTE_LOG_ID = 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
const PRIVATE_KEY_HEX = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
const OPS_TOKEN = 'ops-introspection-secret';
const NONCE = 'e6b7c7a2-4b7e-4a63-9c0d-2f1b52f5a111';

function rootKeysJson(withNonce = true): string {
	return JSON.stringify({
		[LOCAL_LOG_ID]: {
			alg: 'KS256',
			rootSignerAddress: '0xabc0000000000000000000000000000000000abc',
			kind: 'local',
			privateKeyHex: PRIVATE_KEY_HEX,
			...(withNonce ? { configNonce: NONCE } : {})
		},
		[REMOTE_LOG_ID]: {
			alg: 'KS256',
			rootSignerAddress: '0xdead0000000000000000000000000000000000ff',
			kind: 'remote',
			signerUrl: 'https://mandate-conformance-user-signer.example.workers.dev/v1/sign',
			keyRef: 'user-remote',
			bearerEnvKey: 'USER_SIGNER_BEARER',
			...(withNonce ? { configNonce: NONCE } : {})
		}
	});
}

function opsRequest(logId: string | undefined, opts: { auth?: string | null } = {}): Request {
	const url = new URL('https://mandate-agent.example.workers.dev/ops/root-key-config');
	if (logId !== undefined) url.searchParams.set('logId', logId);
	const headers = new Headers();
	const auth = opts.auth === undefined ? `Bearer ${OPS_TOKEN}` : opts.auth;
	if (auth !== null) headers.set('Authorization', auth);
	return new Request(url, { method: 'GET', headers });
}

function deps(overrides: { rootKeys?: string; token?: string | undefined } = {}) {
	return {
		keyRegistry: new KeyRegistry(overrides.rootKeys ?? rootKeysJson()),
		opsIntrospectionToken: 'token' in overrides ? overrides.token : OPS_TOKEN
	};
}

describe('handleRootKeyConfig', () => {
	it('S1: local entry with privateKeyHex present yields NO key material in the response', async () => {
		const response = await handleRootKeyConfig(opsRequest(LOCAL_LOG_ID), deps());
		expect(response.status).toBe(200);
		const raw = await response.text();
		// Byte-grep the serialized response: neither the secret value nor the
		// field name may appear, in any casing.
		expect(raw.toLowerCase()).not.toContain('privatekeyhex');
		expect(raw).not.toContain(PRIVATE_KEY_HEX);
		expect(raw).not.toContain(PRIVATE_KEY_HEX.slice(2));
		const body = JSON.parse(raw) as Record<string, unknown>;
		expect(Object.keys(body).sort()).toEqual(['configNonce', 'keyRef', 'kind', 'ok', 'signerUrl']);
	});

	it('kind:"local" shape: kind + nonce, keyRef/signerUrl null', async () => {
		const response = await handleRootKeyConfig(opsRequest(LOCAL_LOG_ID), deps());
		expect(await response.json()).toEqual({
			ok: true,
			kind: 'local',
			keyRef: null,
			signerUrl: null,
			configNonce: NONCE
		});
	});

	it('kind:"remote" shape: keyRef, signerUrl and nonce populated, no bearerEnvKey', async () => {
		const response = await handleRootKeyConfig(opsRequest(REMOTE_LOG_ID), deps());
		expect(await response.json()).toEqual({
			ok: true,
			kind: 'remote',
			keyRef: 'user-remote',
			signerUrl: 'https://mandate-conformance-user-signer.example.workers.dev/v1/sign',
			configNonce: NONCE
		});
	});

	it('tolerates maps without a configNonce (older states): returns null', async () => {
		const response = await handleRootKeyConfig(
			opsRequest(REMOTE_LOG_ID),
			deps({ rootKeys: rootKeysJson(false) })
		);
		expect(response.status).toBe(200);
		const body = (await response.json()) as { configNonce: unknown };
		expect(body.configNonce).toBeNull();
	});

	it('matches logId case-insensitively (same as the signing lookup)', async () => {
		const response = await handleRootKeyConfig(opsRequest(LOCAL_LOG_ID.toUpperCase()), deps());
		expect(response.status).toBe(200);
	});

	it('fails closed with 503 when OPS_INTROSPECTION_TOKEN is unset', async () => {
		const response = await handleRootKeyConfig(
			opsRequest(LOCAL_LOG_ID),
			deps({ token: undefined })
		);
		expect(response.status).toBe(503);
	});

	it('401 on missing Authorization header', async () => {
		const response = await handleRootKeyConfig(opsRequest(LOCAL_LOG_ID, { auth: null }), deps());
		expect(response.status).toBe(401);
	});

	it('401 on wrong bearer', async () => {
		const response = await handleRootKeyConfig(
			opsRequest(LOCAL_LOG_ID, { auth: 'Bearer wrong-token' }),
			deps()
		);
		expect(response.status).toBe(401);
	});

	it('404 when the logId has no OPERATOR_ROOT_KEYS entry', async () => {
		const response = await handleRootKeyConfig(opsRequest('1'.repeat(64)), deps());
		expect(response.status).toBe(404);
	});

	it('400 when logId is missing or not hex', async () => {
		expect((await handleRootKeyConfig(opsRequest(undefined), deps())).status).toBe(400);
		expect((await handleRootKeyConfig(opsRequest('not-hex!'), deps())).status).toBe(400);
	});

	it('500 (no parse detail) when OPERATOR_ROOT_KEYS is unreadable', async () => {
		const response = await handleRootKeyConfig(
			opsRequest(LOCAL_LOG_ID),
			deps({ rootKeys: 'not json' })
		);
		expect(response.status).toBe(500);
		const raw = await response.text();
		expect(raw).toContain('operator root key config unreadable');
	});
});

describe('timingSafeEqualString', () => {
	it('equal strings compare true, different length/content false', () => {
		expect(timingSafeEqualString('abc', 'abc')).toBe(true);
		expect(timingSafeEqualString('abc', 'abd')).toBe(false);
		expect(timingSafeEqualString('abc', 'abcd')).toBe(false);
		expect(timingSafeEqualString('', '')).toBe(true);
	});
});
