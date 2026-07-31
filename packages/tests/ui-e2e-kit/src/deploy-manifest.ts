import { createHash } from 'node:crypto';
import type { Page } from '@playwright/test';
import {
	ALG_KS256,
	buildImutableDeploymentData,
	DEFAULT_CREATE_CALL,
	ks256AddressToKey,
	predictCreate2Address,
	safeBatchSaltAtIndex
} from '@forestrie/deploy-core';

/**
 * Hermetic mocks for the mandate BFF release-manifest byte proxy
 * (`/api/deploy/manifest/[tag]`, plan-2607-47 slice 02). The mock serves a
 * REAL, internally consistent manifest: the sidecar is the sha256 of the
 * exact manifest bytes and the embedded bytecode digest matches the bytecode,
 * so the wizard's in-page verification runs for real — the suite stays
 * hermetic without bypassing the integrity model.
 */

/** Release tag the mock serves — matches wrangler.jsonc's local default. */
export const E2E_UNIVOCITY_RELEASE_TAG = 'v0.1.8';

/** Tiny stand-in ImutableUnivocity creation bytecode. */
export const E2E_DEPLOY_BYTECODE = '0x600160005260206000f3';

function sha256Hex(data: Uint8Array | string): string {
	return createHash('sha256').update(data).digest('hex');
}

function hexToBytes(hex: string): Uint8Array {
	const stripped = hex.replace(/^0x/, '');
	const out = new Uint8Array(stripped.length / 2);
	for (let i = 0; i < out.length; i++) {
		out[i] = parseInt(stripped.slice(i * 2, i * 2 + 2), 16);
	}
	return out;
}

/**
 * The plan the wizard must derive from the mocked release: same primitives,
 * same constants — specs use this to pre-place code at the predicted address
 * (resume fast-path) and to cross-check the UI's prediction.
 */
export function e2eDeployPlan(
	safeAddress: string,
	instanceIndex = 0
): { salt: string; predictedAddress: string } {
	const deploymentData = buildImutableDeploymentData(
		E2E_DEPLOY_BYTECODE as `0x${string}`,
		ALG_KS256,
		ks256AddressToKey(safeAddress)
	);
	const salt = safeBatchSaltAtIndex(safeAddress as `0x${string}`, instanceIndex);
	return {
		salt,
		predictedAddress: predictCreate2Address(DEFAULT_CREATE_CALL, salt, deploymentData)
	};
}

export interface DeployManifestMockOptions {
	releaseTag?: string;
	/** Serve a sidecar that does NOT match the manifest bytes. */
	corruptSidecar?: boolean;
}

export interface DeployManifestMockHandle {
	manifestFetches: () => number;
	sidecarFetches: () => number;
}

export async function installDeployManifestMocks(
	page: Page,
	options: DeployManifestMockOptions = {}
): Promise<DeployManifestMockHandle> {
	const releaseTag = options.releaseTag ?? E2E_UNIVOCITY_RELEASE_TAG;
	const manifestJson = JSON.stringify({
		version: 1,
		releaseId: releaseTag,
		contracts: {
			ImutableUnivocity: {
				contractName: 'ImutableUnivocity',
				creationBytecode: E2E_DEPLOY_BYTECODE,
				bytecodeSha256: sha256Hex(hexToBytes(E2E_DEPLOY_BYTECODE)),
				solcVersion: '0.8.24'
			}
		}
	});
	const digest = options.corruptSidecar ? 'ff'.repeat(32) : sha256Hex(manifestJson);
	const sidecar = `${digest}  deploy-manifest-${releaseTag}.json\n`;

	let manifestFetches = 0;
	let sidecarFetches = 0;

	await page.route(`**/api/deploy/manifest/${releaseTag}`, async (route) => {
		if (route.request().method() !== 'GET') return route.fallback();
		manifestFetches += 1;
		await route.fulfill({ status: 200, contentType: 'application/json', body: manifestJson });
	});
	await page.route(`**/api/deploy/manifest/${releaseTag}/sidecar`, async (route) => {
		if (route.request().method() !== 'GET') return route.fallback();
		sidecarFetches += 1;
		await route.fulfill({ status: 200, contentType: 'text/plain; charset=utf-8', body: sidecar });
	});

	return {
		manifestFetches: () => manifestFetches,
		sidecarFetches: () => sidecarFetches
	};
}
