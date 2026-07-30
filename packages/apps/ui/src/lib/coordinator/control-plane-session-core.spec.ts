import { describe, expect, it, vi } from 'vitest';
import type { ControlPlaneScope } from '@mandate/coordinator-types';
import {
	controlPlaneCacheKey,
	ensureCachedControlPlaneSession,
	exchangeControlPlaneSession,
	isSessionFresh
} from './control-plane-session-core.js';

const authLogId = '0123456789abcdef0123456789abcdef';
const scopes: ControlPlaneScope[] = ['delegations:read'];

describe('control-plane-session-core', () => {
	it('builds stable cache keys', () => {
		expect(controlPlaneCacheKey(authLogId, ['delegations:read', 'logs:enabled:read'])).toBe(
			`${authLogId}:delegations:read,logs:enabled:read`
		);
	});

	it('reuses a fresh cached session', async () => {
		const cache = new Map();
		const fetch = vi.fn();
		const signMessage = vi.fn();
		const nowMs = vi.fn(() => 1_000_000);

		cache.set(controlPlaneCacheKey(authLogId, scopes), {
			token: 'v1.cached',
			expiresAt: 2_000,
			authLogId,
			scopes
		});

		const session = await ensureCachedControlPlaneSession(authLogId, scopes, cache, {
			fetch,
			signMessage,
			nowMs
		});

		expect(session.token).toBe('v1.cached');
		expect(fetch).not.toHaveBeenCalled();
		expect(signMessage).not.toHaveBeenCalled();
	});

	it('exchanges challenge then session with injected deps', async () => {
		const fetch = vi
			.fn()
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						version: 'wcc-1',
						domain: 'localhost',
						coordinatorOrigin: 'http://localhost',
						authLogId,
						scopes,
						nonce: 'nonce-1',
						issuedAt: 100,
						expiresAt: 200
					}),
					{ status: 200 }
				)
			)
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						token: 'v1.new',
						expiresAt: 300,
						authLogId,
						scopes
					}),
					{ status: 200 }
				)
			);
		const signMessage = vi.fn(async () => '0xabc');

		const session = await exchangeControlPlaneSession(authLogId, scopes, {
			fetch,
			signMessage,
			challengePath: '/challenge',
			sessionPath: '/session'
		});

		expect(signMessage).toHaveBeenCalledOnce();
		expect(fetch).toHaveBeenCalledTimes(2);
		expect(session.token).toBe('v1.new');
		expect(isSessionFresh(session, 250_000)).toBe(true);
		expect(isSessionFresh(session, 350_000)).toBe(false);
	});

	function challengeAndSessionFetch() {
		return vi
			.fn()
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						version: 'wcc-1',
						domain: 'localhost',
						coordinatorOrigin: 'http://localhost',
						authLogId,
						scopes,
						nonce: 'nonce-1',
						issuedAt: 100,
						expiresAt: 200
					}),
					{ status: 200 }
				)
			)
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ token: 'v1.new', expiresAt: 300, authLogId, scopes }), {
					status: 200
				})
			);
	}

	it('binds envelopeChainId into the signed message and the posted envelope', async () => {
		const fetch = challengeAndSessionFetch();
		const signMessage = vi.fn<(message: string) => Promise<string>>(async () => '0xabc');

		await exchangeControlPlaneSession(authLogId, scopes, {
			fetch,
			signMessage,
			envelopeChainId: () => '84532',
			challengePath: '/challenge',
			sessionPath: '/session'
		});

		// The chain id is part of what the wallet signed (wcc-1 Chain ID line)…
		expect(signMessage.mock.calls[0]![0]).toContain('Chain ID: 84532');
		// …and of the envelope the coordinator receives and enforces.
		const sessionBody = JSON.parse(fetch.mock.calls[1]![1]!.body as string);
		expect(sessionBody.envelope.chainId).toBe('84532');
	});

	it('omits chainId entirely when the dep declines (chain-free EOA signers)', async () => {
		const fetch = challengeAndSessionFetch();
		const signMessage = vi.fn<(message: string) => Promise<string>>(async () => '0xabc');

		await exchangeControlPlaneSession(authLogId, scopes, {
			fetch,
			signMessage,
			envelopeChainId: () => undefined,
			challengePath: '/challenge',
			sessionPath: '/session'
		});

		expect(signMessage.mock.calls[0]![0]).not.toContain('Chain ID:');
		const sessionBody = JSON.parse(fetch.mock.calls[1]![1]!.body as string);
		expect('chainId' in sessionBody.envelope).toBe(false);
	});
});
