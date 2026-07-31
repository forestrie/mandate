import { describe, expect, it, vi } from 'vitest';
import { fetchManifestAsset, manifestProxyConfig, releaseTagError } from './manifest-proxy.js';

const TAG = 'v0.1.8';

function response(status: number, body: BodyInit | null, headers?: Record<string, string>) {
	return new Response(body, { status, headers });
}

describe('releaseTagError', () => {
	it('accepts plain release tags', () => {
		expect(releaseTagError('v0.1.8')).toBeNull();
		expect(releaseTagError('release_2.0-rc.1')).toBeNull();
	});

	it('refuses path-shaped and empty tags', () => {
		expect(releaseTagError('../secrets')).toMatch(/plain tag name/);
		expect(releaseTagError('a/b')).toMatch(/plain tag name/);
		expect(releaseTagError('')).toMatch(/plain tag name/);
	});

	it('refuses the latest sentinel — the default tag is resolved at build time', () => {
		expect(releaseTagError('latest')).toMatch(/concrete release tag/);
		expect(releaseTagError('Latest')).toMatch(/concrete release tag/);
	});
});

describe('manifestProxyConfig', () => {
	it('treats a blank token as absent', () => {
		expect(manifestProxyConfig({}).githubToken).toBeNull();
		expect(manifestProxyConfig({ MANDATE_GITHUB_TOKEN: '  ' }).githubToken).toBeNull();
		expect(manifestProxyConfig({ MANDATE_GITHUB_TOKEN: 'tok' }).githubToken).toBe('tok');
	});
});

describe('fetchManifestAsset — tokenless public download path', () => {
	const config = manifestProxyConfig({});

	it('proxies manifest bytes from the public release download URL', async () => {
		const fetchImpl = vi.fn(async (url: RequestInfo | URL) => {
			expect(String(url)).toBe(
				`https://github.com/forestrie/univocity/releases/download/${TAG}/deploy-manifest-${TAG}.json`
			);
			return response(200, '{"version":1}');
		});
		const result = await fetchManifestAsset(config, TAG, false, fetchImpl as typeof fetch);
		if (!result.ok) throw new Error(result.detail);
		expect(new TextDecoder().decode(result.bytes)).toBe('{"version":1}');
		expect(result.contentType).toBe('application/json');
	});

	it('requests the sha256 sidecar as text', async () => {
		const fetchImpl = vi.fn(async (url: RequestInfo | URL) => {
			expect(String(url)).toContain(`deploy-manifest-${TAG}.json.sha256`);
			return response(200, 'abc123  deploy-manifest.json');
		});
		const result = await fetchManifestAsset(config, TAG, true, fetchImpl as typeof fetch);
		if (!result.ok) throw new Error(result.detail);
		expect(result.contentType).toContain('text/plain');
	});

	it('maps an unknown tag to 404 with a releases-page pointer', async () => {
		const fetchImpl = vi.fn(async () => response(404, 'not found'));
		const result = await fetchManifestAsset(config, TAG, false, fetchImpl as typeof fetch);
		expect(result).toMatchObject({ ok: false, status: 404 });
		if (result.ok) throw new Error('expected failure');
		expect(result.detail).toMatch(/releases page/);
	});

	it('maps upstream failures and network errors to 502', async () => {
		const failing = vi.fn(async () => response(500, 'boom'));
		expect(await fetchManifestAsset(config, TAG, false, failing as typeof fetch)).toMatchObject({
			ok: false,
			status: 502
		});
		const throwing = vi.fn(async () => {
			throw new Error('socket hang up');
		});
		const result = await fetchManifestAsset(config, TAG, false, throwing as typeof fetch);
		expect(result).toMatchObject({ ok: false, status: 502 });
		if (result.ok) throw new Error('expected failure');
		expect(result.detail).toContain('socket hang up');
	});

	it('rejects a bad tag before any fetch happens', async () => {
		const fetchImpl = vi.fn();
		const result = await fetchManifestAsset(config, 'latest', false, fetchImpl as typeof fetch);
		expect(result).toMatchObject({ ok: false, status: 400 });
		expect(fetchImpl).not.toHaveBeenCalled();
	});
});

describe('fetchManifestAsset — authenticated releases API path', () => {
	const config = manifestProxyConfig({ MANDATE_GITHUB_TOKEN: 'gh-token' });

	it('resolves the asset via the API and follows the storage redirect WITHOUT auth', async () => {
		const seen: Array<{ url: string; auth: string | undefined; redirect?: string }> = [];
		const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
			const headers = (init?.headers ?? {}) as Record<string, string>;
			seen.push({ url: String(url), auth: headers.authorization, redirect: init?.redirect });
			if (String(url).endsWith(`/releases/tags/${TAG}`)) {
				return response(
					200,
					JSON.stringify({
						assets: [
							{ name: `deploy-manifest-${TAG}.json`, url: 'https://api.github.com/assets/1' },
							{ name: `deploy-manifest-${TAG}.json.sha256`, url: 'https://api.github.com/assets/2' }
						]
					})
				);
			}
			if (String(url) === 'https://api.github.com/assets/1') {
				return response(302, null, { location: 'https://objects.example/signed' });
			}
			if (String(url) === 'https://objects.example/signed') {
				return response(200, '{"version":1}');
			}
			throw new Error(`unexpected fetch ${String(url)}`);
		});
		const result = await fetchManifestAsset(config, TAG, false, fetchImpl as typeof fetch);
		if (!result.ok) throw new Error(result.detail);
		expect(new TextDecoder().decode(result.bytes)).toBe('{"version":1}');
		// Release lookup and asset request carry the token; the signed storage
		// URL must be fetched bare.
		expect(seen[0]).toMatchObject({ auth: 'Bearer gh-token' });
		expect(seen[1]).toMatchObject({ auth: 'Bearer gh-token', redirect: 'manual' });
		expect(seen[2]!.auth).toBeUndefined();
	});

	it('404s when the release exists but lacks the manifest asset', async () => {
		const fetchImpl = vi.fn(async (url: RequestInfo | URL) => {
			if (String(url).endsWith(`/releases/tags/${TAG}`)) {
				return response(200, JSON.stringify({ assets: [] }));
			}
			throw new Error('unexpected');
		});
		const result = await fetchManifestAsset(config, TAG, false, fetchImpl as typeof fetch);
		expect(result).toMatchObject({ ok: false, status: 404 });
		if (result.ok) throw new Error('expected failure');
		expect(result.detail).toContain(`deploy-manifest-${TAG}.json`);
	});

	it('selects the sidecar asset for sidecar requests', async () => {
		const fetchImpl = vi.fn(async (url: RequestInfo | URL) => {
			if (String(url).endsWith(`/releases/tags/${TAG}`)) {
				return response(
					200,
					JSON.stringify({
						assets: [
							{ name: `deploy-manifest-${TAG}.json.sha256`, url: 'https://api.github.com/assets/2' }
						]
					})
				);
			}
			if (String(url) === 'https://api.github.com/assets/2') {
				return response(200, 'abc  deploy-manifest.json');
			}
			throw new Error(`unexpected fetch ${String(url)}`);
		});
		const result = await fetchManifestAsset(config, TAG, true, fetchImpl as typeof fetch);
		if (!result.ok) throw new Error(result.detail);
		expect(result.contentType).toContain('text/plain');
	});
});
