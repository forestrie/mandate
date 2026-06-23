#!/usr/bin/env node
/**
 * Fail CI/lint if legacy secret env names appear in code, scripts, or workflows.
 * See ADR-0006 and docs/service-secrets.md for the rename map.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));

/** Old names banned outside docs/ and spikes/ */
const LEGACY_NAMES = [
	'PRIVY_APP_ID',
	'PRIVY_APP_SECRET',
	'PRIVY_AUTHORIZATION_KEY',
	'PRIVY_WALLET_SIGNER',
	'PRIVY_MANDATE_SIGNER_ID',
	'PRIVY_MODE_C_WALLET_ID',
	'PRIVY_OWNER_AUTHORIZATION_KEY',
	'PRIVY_WALLET_ID',
	'PRIVY_WALLET_ADDRESS',
	'PRIVY_MODE_C_WALLET_ADDRESS',
	'PRIVY_DELEGATION_POLICY_ID',
	'PUBLIC_PRIVY_APP_ID',
	'PUBLIC_PRIVY_CLIENT_ID',
	'PRIVY_API_BASE',
	'CANOPY_API_URL',
	'CANOPY_BASE_URL',
	'CANOPY_PAYMENTS_ONBOARD_TOKEN',
	'CANOPY_OPS_ADMIN_TOKEN',
	'CANOPY_UNIVOCITY_ADDR',
	'CANOPY_CHAIN_ID',
	'DELEGATION_COORDINATOR_URL',
	'MANDATE_AGENT_WEBHOOK_URL'
];

const SCAN_ROOTS = ['packages', 'scripts', '.github/workflows'];

const SKIP_DIR_NAMES = new Set(['node_modules', '.svelte-kit', 'dist', '.wrangler', 'coverage']);

const LEGACY_PATTERNS = LEGACY_NAMES.map(
	(name) => new RegExp(`(?<![A-Z0-9_])${name}(?![A-Z0-9_])`, 'g')
);

function shouldScanFile(relPath) {
	if (relPath.endsWith('check-legacy-secret-names.mjs')) return false;
	if (relPath.includes('wrangler.env.prod.json')) return false;
	return !relPath.startsWith('spikes/');
}

function walk(dir, files = []) {
	for (const entry of readdirSync(dir)) {
		if (SKIP_DIR_NAMES.has(entry)) continue;
		const path = join(dir, entry);
		const rel = relative(repoRoot, path);
		if (!shouldScanFile(rel)) continue;
		const st = statSync(path);
		if (st.isDirectory()) walk(path, files);
		else if (/\.(ts|tsx|js|mjs|cjs|yml|yaml|sh|jsonc|example)$/.test(entry)) {
			files.push(path);
		}
	}
	return files;
}

const violations = [];

for (const root of SCAN_ROOTS) {
	const abs = resolve(repoRoot, root);
	try {
		statSync(abs);
	} catch {
		continue;
	}
	for (const file of walk(abs)) {
		const text = readFileSync(file, 'utf8');
		const rel = relative(repoRoot, file);
		for (const [index, pattern] of LEGACY_PATTERNS.entries()) {
			if (pattern.test(text)) {
				violations.push(`${rel}: legacy name ${LEGACY_NAMES[index]}`);
			}
			pattern.lastIndex = 0;
		}
	}
}

if (violations.length > 0) {
	console.error('Legacy secret env names found (use MANDATE_* / E2E_* per ADR-0006):\n');
	for (const v of violations) console.error(`  ${v}`);
	process.exit(1);
}

console.log('Legacy secret name check passed.');
