import {
	univocityManifestUrls,
	UNIVOCITY_GITHUB_ORG,
	UNIVOCITY_GITHUB_REPO
} from '@forestrie/deploy-core';

/**
 * Release-manifest byte proxy for the /onboard inline deploy branch
 * (plan-2607-47 slice 02, Q7a). The BFF is a DUMB proxy: it forwards the
 * `deploy-manifest-<tag>.json` + `.sha256` release assets byte-for-byte and
 * never interprets them — verification (sha256 sidecar + embedded bytecode
 * digests) happens in-page, keeping the ADR-0010 / FORKING Path B′ integrity
 * model unchanged. The proxy exists because browsers cannot fetch GitHub
 * release assets directly (CORS) and Cloudflare's shared egress IPs exhaust
 * the anonymous api.github.com bucket (the deploy-web 403 class).
 *
 * `MANDATE_GITHUB_TOKEN` is optional: when set, assets are resolved through
 * the authenticated releases API (immune to anonymous rate limits); when
 * unset, the proxy falls back to the public release download URL, which is
 * CDN-served and not API-rate-limited — fine for local dev and previews.
 */

const GITHUB_API_BASE = 'https://api.github.com';

/** Release tags are pathless single segments; the `latest` sentinel is refused. */
export function releaseTagError(tag: string): string | null {
	if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(tag)) {
		return 'Release tag must be a plain tag name (letters, digits, ., _, -).';
	}
	if (tag.toLowerCase() === 'latest') {
		return 'The "latest" sentinel is not proxied — pass a concrete release tag.';
	}
	return null;
}

export interface ManifestProxyConfig {
	/** Optional GitHub token for the authenticated releases API path. */
	githubToken: string | null;
}

export function manifestProxyConfig(env: Record<string, string | undefined>): ManifestProxyConfig {
	const githubToken = env.MANDATE_GITHUB_TOKEN?.trim();
	return { githubToken: githubToken || null };
}

export type ManifestAssetResult =
	| { ok: true; bytes: ArrayBuffer; contentType: string }
	| { ok: false; status: number; detail: string };

function assetContentType(sidecar: boolean): string {
	return sidecar ? 'text/plain; charset=utf-8' : 'application/json';
}

async function fetchPublicDownload(
	tag: string,
	sidecar: boolean,
	fetchImpl: typeof fetch
): Promise<ManifestAssetResult> {
	const { manifestUrl, sidecarUrl } = univocityManifestUrls(tag);
	const url = sidecar ? sidecarUrl : manifestUrl;
	const response = await fetchImpl(url, { redirect: 'follow' });
	if (response.status === 404) {
		return {
			ok: false,
			status: 404,
			detail: `No deploy-manifest asset for release ${tag} — check the tag against the univocity releases page.`
		};
	}
	if (!response.ok) {
		return {
			ok: false,
			status: 502,
			detail: `GitHub release download answered ${response.status} for ${tag}.`
		};
	}
	return { ok: true, bytes: await response.arrayBuffer(), contentType: assetContentType(sidecar) };
}

async function fetchViaReleasesApi(
	tag: string,
	sidecar: boolean,
	token: string,
	fetchImpl: typeof fetch
): Promise<ManifestAssetResult> {
	const headers = {
		authorization: `Bearer ${token}`,
		accept: 'application/vnd.github+json',
		'user-agent': 'mandate-console-bff'
	};
	const releaseUrl = `${GITHUB_API_BASE}/repos/${UNIVOCITY_GITHUB_ORG}/${UNIVOCITY_GITHUB_REPO}/releases/tags/${tag}`;
	const releaseResponse = await fetchImpl(releaseUrl, { headers });
	if (releaseResponse.status === 404) {
		return {
			ok: false,
			status: 404,
			detail: `No univocity release tagged ${tag} — check the tag against the releases page.`
		};
	}
	if (!releaseResponse.ok) {
		return {
			ok: false,
			status: 502,
			detail: `GitHub releases API answered ${releaseResponse.status} for ${tag}.`
		};
	}
	const release = (await releaseResponse.json()) as {
		assets?: Array<{ name?: string; url?: string }>;
	};
	const { manifestFileName } = univocityManifestUrls(tag);
	const assetName = sidecar ? `${manifestFileName}.sha256` : manifestFileName;
	const asset = release.assets?.find((entry) => entry.name === assetName);
	if (!asset?.url) {
		return {
			ok: false,
			status: 404,
			detail: `Release ${tag} has no ${assetName} asset.`
		};
	}
	// Asset bytes come from a one-shot redirect to object storage; the
	// Authorization header must NOT follow the redirect (the storage endpoint
	// rejects requests carrying both its signed URL and a bearer header).
	const assetResponse = await fetchImpl(asset.url, {
		headers: { ...headers, accept: 'application/octet-stream' },
		redirect: 'manual'
	});
	if (assetResponse.status >= 300 && assetResponse.status < 400) {
		const location = assetResponse.headers.get('location');
		if (!location) {
			return { ok: false, status: 502, detail: 'GitHub asset redirect carried no location.' };
		}
		const bytesResponse = await fetchImpl(location, { redirect: 'follow' });
		if (!bytesResponse.ok) {
			return {
				ok: false,
				status: 502,
				detail: `GitHub asset download answered ${bytesResponse.status} for ${assetName}.`
			};
		}
		return {
			ok: true,
			bytes: await bytesResponse.arrayBuffer(),
			contentType: assetContentType(sidecar)
		};
	}
	if (!assetResponse.ok) {
		return {
			ok: false,
			status: 502,
			detail: `GitHub asset download answered ${assetResponse.status} for ${assetName}.`
		};
	}
	return {
		ok: true,
		bytes: await assetResponse.arrayBuffer(),
		contentType: assetContentType(sidecar)
	};
}

/** Fetch manifest (or sidecar) bytes for a release tag, upstream chosen by config. */
export async function fetchManifestAsset(
	config: ManifestProxyConfig,
	tag: string,
	sidecar: boolean,
	fetchImpl: typeof fetch = fetch
): Promise<ManifestAssetResult> {
	const tagError = releaseTagError(tag);
	if (tagError) return { ok: false, status: 400, detail: tagError };
	try {
		if (config.githubToken) {
			return await fetchViaReleasesApi(tag, sidecar, config.githubToken, fetchImpl);
		}
		return await fetchPublicDownload(tag, sidecar, fetchImpl);
	} catch (error) {
		return {
			ok: false,
			status: 502,
			detail: `GitHub unreachable: ${error instanceof Error ? error.message : String(error)}`
		};
	}
}
