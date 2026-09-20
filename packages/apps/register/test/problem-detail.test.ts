import { encodeCborDeterministic as encodeCbor } from '@forestrie/encoding';
import { describe, expect, it } from 'vitest';
import { postGenesis } from '../src/genesis-client.js';
import { responseProblemDetail } from '../src/problem-detail.js';

const problem = {
	type: 'about:blank',
	title: 'Bad Request',
	status: 400,
	detail: 'Invalid CBOR body'
};

describe('responseProblemDetail', () => {
	it('decodes application/cbor problem details as canopy-api sends them', async () => {
		const response = new Response(encodeCbor(problem) as unknown as BodyInit, {
			status: 400,
			headers: { 'Content-Type': 'application/cbor' }
		});
		expect(await responseProblemDetail(response)).toBe('Bad Request: Invalid CBOR body');
	});

	it('decodes application/problem+cbor and application/problem+json', async () => {
		const cbor = new Response(encodeCbor(problem) as unknown as BodyInit, {
			status: 400,
			headers: { 'Content-Type': 'application/problem+cbor' }
		});
		expect(await responseProblemDetail(cbor)).toBe('Bad Request: Invalid CBOR body');
		const json = new Response(JSON.stringify({ ...problem, detail: undefined }), {
			status: 400,
			headers: { 'Content-Type': 'application/problem+json' }
		});
		expect(await responseProblemDetail(json)).toBe('Bad Request');
	});

	it('falls back to the text body, and to empty for no body', async () => {
		expect(
			await responseProblemDetail(
				new Response('Invalid or revoked onboard token.', { status: 401 })
			)
		).toBe('Invalid or revoked onboard token.');
		expect(await responseProblemDetail(new Response(null, { status: 404 }))).toBe('');
		const notCbor = new Response(new Uint8Array([0xff, 0xff]), {
			status: 400,
			headers: { 'Content-Type': 'application/cbor' }
		});
		expect(typeof (await responseProblemDetail(notCbor))).toBe('string');
	});
});

describe('postGenesis error detail', () => {
	it('carries the decoded problem detail on GenesisClientError (FOR-579)', async () => {
		const fetchImpl = async () =>
			new Response(encodeCbor(problem) as unknown as BodyInit, {
				status: 400,
				headers: { 'Content-Type': 'application/cbor' }
			});
		await expect(
			postGenesis({
				forestR: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
				body: new Uint8Array([0]),
				onboardToken: 'onboard-token',
				canopyBaseUrl: 'https://api.example.dev',
				fetchImpl
			})
		).rejects.toMatchObject({
			name: 'GenesisClientError',
			status: 400,
			message: 'genesis POST failed: 400',
			detail: 'Bad Request: Invalid CBOR body'
		});
	});
});
