import { encode as encodeCbor } from 'cbor-x';
import { describe, expect, it } from 'vitest';
import { postGenesis } from '../src/genesis-client.js';
import { GenesisClientError } from '../src/genesis-client-error.js';

describe('postGenesis', () => {
	it('returns genesis response when coordinator forward succeeds', async () => {
		const coordinator = { publicRoot: 'ok' as const, webhook: 'ok' as const };
		const responseBody = {
			R: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
			class: 'payment-authoritative',
			chainBinding: { chainId: '84532', univocityAddr: 'abcd'.repeat(10) },
			coordinator
		};
		const fetchImpl = async () =>
			new Response(encodeCbor(responseBody) as unknown as BodyInit, {
				status: 201,
				headers: { 'Content-Type': 'application/cbor' }
			});

		const result = await postGenesis({
			forestR: responseBody.R,
			body: new Uint8Array([0]),
			onboardToken: 'onboard-token',
			webhookUrl: 'https://agent.example/webhooks/delegation-required',
			canopyBaseUrl: 'https://api.example.dev',
			fetchImpl
		});

		expect(result.R).toBe(responseBody.R);
		expect(result.coordinator).toEqual(coordinator);
	});

	it('surfaces 401 auth failures', async () => {
		const fetchImpl = async () =>
			new Response('Invalid or revoked onboard token.', { status: 401 });

		await expect(
			postGenesis({
				forestR: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
				body: new Uint8Array([0]),
				onboardToken: 'bad',
				canopyBaseUrl: 'https://api.example.dev',
				fetchImpl
			})
		).rejects.toMatchObject({ name: 'GenesisClientError', status: 401 });
	});

	it('fails closed when coordinator forward is incomplete', async () => {
		const responseBody = {
			R: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
			class: 'payment-authoritative',
			chainBinding: { chainId: '84532', univocityAddr: 'abcd'.repeat(10) },
			coordinator: { publicRoot: 'ok', webhook: 'error', detail: 'webhook 403' }
		};
		const fetchImpl = async () =>
			new Response(encodeCbor(responseBody) as unknown as BodyInit, { status: 201 });

		await expect(
			postGenesis({
				forestR: responseBody.R,
				body: new Uint8Array([0]),
				onboardToken: 'onboard-token',
				webhookUrl: 'https://agent.example/webhooks/delegation-required',
				canopyBaseUrl: 'https://api.example.dev',
				fetchImpl
			})
		).rejects.toBeInstanceOf(GenesisClientError);
	});
});
