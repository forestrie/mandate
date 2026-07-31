import {
	verifyAndParseImutableManifest,
	verifyManifestBytesWithSidecar,
	type DeployManifest
} from '@forestrie/deploy-core';
import type { Hex } from 'viem';

/**
 * Browser side of the manifest byte proxy (plan-2607-47 slice 02, Q7a): fetch
 * the exact release bytes through the BFF, then verify EVERYTHING in-page —
 * the sha256 sidecar over the manifest bytes, and the embedded per-contract
 * bytecode digests. The proxy is untrusted plumbing; a tampered or truncated
 * manifest fails here, before any address is predicted or transaction built
 * (ADR-0010 / FORKING Path B′).
 */

export interface VerifiedRelease {
	releaseTag: string;
	manifest: DeployManifest;
	/** ImutableUnivocity creation bytecode, digest-verified. */
	bytecode: Hex;
}

async function readProblemDetail(response: Response): Promise<string> {
	try {
		const problem = (await response.json()) as { detail?: string; title?: string };
		return problem.detail ?? problem.title ?? `HTTP ${response.status}`;
	} catch {
		return `HTTP ${response.status}`;
	}
}

export async function fetchVerifiedRelease(
	releaseTag: string,
	fetchImpl: typeof fetch = fetch
): Promise<VerifiedRelease> {
	const base = `/api/deploy/manifest/${encodeURIComponent(releaseTag)}`;
	const [manifestResponse, sidecarResponse] = await Promise.all([
		fetchImpl(base),
		fetchImpl(`${base}/sidecar`)
	]);
	if (!manifestResponse.ok) {
		throw new Error(`Release manifest fetch failed: ${await readProblemDetail(manifestResponse)}`);
	}
	if (!sidecarResponse.ok) {
		throw new Error(
			`Release manifest sidecar fetch failed: ${await readProblemDetail(sidecarResponse)}`
		);
	}
	const manifestBytes = new Uint8Array(await manifestResponse.arrayBuffer());
	const sidecar = await sidecarResponse.text();
	await verifyManifestBytesWithSidecar(manifestBytes, sidecar);
	const { manifest, artifact } = await verifyAndParseImutableManifest(
		new TextDecoder().decode(manifestBytes),
		{ expectedReleaseId: releaseTag }
	);
	return { releaseTag, manifest, bytecode: artifact.bytecode };
}
