#!/usr/bin/env node
/**
 * Deep-merge base wrangler.jsonc with a gitignored env.prod overlay.
 *
 * Usage:
 *   node scripts/merge-wrangler-config.mjs \
 *     --base packages/apps/agent/wrangler.jsonc \
 *     --overlay packages/apps/agent/wrangler.env.prod.json \
 *     --out .wrangler/deploy/agent.wrangler.jsonc
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

function parseArgs(argv) {
	const opts = { base: '', overlay: '', out: '' };
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === '--base') opts.base = argv[++i] ?? '';
		else if (arg === '--overlay') opts.overlay = argv[++i] ?? '';
		else if (arg === '--out') opts.out = argv[++i] ?? '';
	}
	if (!opts.base || !opts.overlay || !opts.out) {
		console.error('Usage: merge-wrangler-config.mjs --base <path> --overlay <path> --out <path>');
		process.exit(1);
	}
	return opts;
}

function deepMerge(base, overlay) {
	const out = { ...base };
	for (const [key, value] of Object.entries(overlay)) {
		if (
			value &&
			typeof value === 'object' &&
			!Array.isArray(value) &&
			base[key] &&
			typeof base[key] === 'object' &&
			!Array.isArray(base[key])
		) {
			out[key] = deepMerge(base[key], value);
		} else {
			out[key] = value;
		}
	}
	return out;
}

function main() {
	const opts = parseArgs(process.argv.slice(2));
	const basePath = resolve(repoRoot, opts.base);
	const overlayPath = resolve(repoRoot, opts.overlay);
	const outPath = resolve(repoRoot, opts.out);

	const merged = deepMerge(
		JSON.parse(readFileSync(basePath, 'utf8')),
		JSON.parse(readFileSync(overlayPath, 'utf8'))
	);

	mkdirSync(dirname(outPath), { recursive: true });
	writeFileSync(outPath, `${JSON.stringify(merged, null, '\t')}\n`, 'utf8');
	console.log(`[merge-wrangler] wrote ${opts.out}`);
}

main();
