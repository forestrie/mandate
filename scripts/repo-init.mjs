#!/usr/bin/env node
/**
 * Provision account-specific Cloudflare resources and gitignored wrangler env.prod
 * overlays for Workers deploy.
 *
 * Requires CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID.
 * Set CICD=true in CI (always refresh overlays from examples).
 */

import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

const AGENT = {
	base: 'packages/apps/agent/wrangler.jsonc',
	example: 'packages/apps/agent/wrangler.env.prod.json.example',
	overlay: 'packages/apps/agent/wrangler.env.prod.json',
	deploy: '.wrangler/deploy/agent.wrangler.jsonc',
	kvTitle: 'mandate-agent-prod-request-keys',
	kvPlaceholder: 'REPLACE_WITH_REQUEST_KEYS_KV_ID'
};

const SIGNER = {
	base: 'packages/apps/signer/wrangler.jsonc',
	example: 'packages/apps/signer/wrangler.env.prod.json.example',
	overlay: 'packages/apps/signer/wrangler.env.prod.json',
	deploy: '.wrangler/deploy/signer.wrangler.jsonc',
	privyPlaceholder: 'REPLACE_WITH_MANDATE_PRIVY_APP_ID'
};

function requireEnv(name) {
	if (!process.env[name]?.trim()) {
		console.error(`[repo-init] required env ${name} is not set`);
		process.exit(1);
	}
}

function runNode(script, args) {
	execFileSync(process.execPath, [resolve(repoRoot, script), ...args], {
		cwd: repoRoot,
		stdio: 'inherit',
		env: process.env
	});
}

function ensureOverlay(exampleRel, overlayRel, force) {
	const example = resolve(repoRoot, exampleRel);
	const overlay = resolve(repoRoot, overlayRel);
	if (force || !existsSync(overlay)) {
		copyFileSync(example, overlay);
		console.log(`[repo-init] wrote ${overlayRel} from example`);
		return;
	}
	console.log(`[repo-init] keeping existing ${overlayRel}`);
}

function injectEnvPlaceholder(overlayRel, placeholder, value) {
	if (!value?.trim()) return;
	const path = resolve(repoRoot, overlayRel);
	let text = readFileSync(path, 'utf8');
	if (!text.includes(placeholder)) return;
	text = text.replaceAll(placeholder, value.trim());
	writeFileSync(path, text, 'utf8');
	console.log(`[repo-init] set ${placeholder} in ${overlayRel}`);
}

function main() {
	requireEnv('CLOUDFLARE_API_TOKEN');
	requireEnv('CLOUDFLARE_ACCOUNT_ID');

	const cicd = process.env.CICD === 'true';
	if (cicd) {
		console.log('[repo-init] CICD=true: refreshing env.prod overlays from examples');
	}

	ensureOverlay(AGENT.example, AGENT.overlay, cicd);
	ensureOverlay(SIGNER.example, SIGNER.overlay, cicd);

	runNode('scripts/ensure-kv.mjs', [
		'--config',
		AGENT.overlay,
		'--title',
		AGENT.kvTitle,
		'--placeholder',
		AGENT.kvPlaceholder
	]);

	injectEnvPlaceholder(
		SIGNER.overlay,
		SIGNER.privyPlaceholder,
		process.env.PUBLIC_MANDATE_PRIVY_APP_ID ?? process.env.MANDATE_PRIVY_APP_ID
	);

	runNode('scripts/merge-wrangler-config.mjs', [
		'--base',
		AGENT.base,
		'--overlay',
		AGENT.overlay,
		'--out',
		AGENT.deploy
	]);
	runNode('scripts/merge-wrangler-config.mjs', [
		'--base',
		SIGNER.base,
		'--overlay',
		SIGNER.overlay,
		'--out',
		SIGNER.deploy
	]);

	console.log('[repo-init] done');
}

main();
