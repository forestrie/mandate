#!/usr/bin/env node
/**
 * Ensure a Cloudflare KV namespace exists by title and inject its id into
 * wrangler.jsonc before deploy.
 *
 * Usage:
 *   node scripts/ensure-kv.mjs \
 *     --config packages/apps/agent/wrangler.jsonc \
 *     --title mandate-agent-prod-request-keys \
 *     --placeholder REPLACE_WITH_REQUEST_KEYS_KV_ID
 *
 * Requires CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const wranglerBin = resolve(repoRoot, 'node_modules/wrangler/bin/wrangler.js');

const KV_ID_RE = /^[0-9a-fA-F]{32}$/;

function parseArgs(argv) {
	const opts = { config: '', title: '', placeholder: '' };
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === '--config') opts.config = argv[++i] ?? '';
		else if (arg === '--title') opts.title = argv[++i] ?? '';
		else if (arg === '--placeholder') opts.placeholder = argv[++i] ?? '';
		else if (arg === '--help' || arg === '-h') {
			console.log(`Usage: node scripts/ensure-kv.mjs \\
  --config <wrangler.jsonc> \\
  --title <kv-namespace-title> \\
  --placeholder <token-in-config>`);
			process.exit(0);
		}
	}
	if (!opts.config || !opts.title || !opts.placeholder) {
		console.error('Missing required --config, --title, or --placeholder');
		process.exit(1);
	}
	return opts;
}

function wrangler(...args) {
	return execFileSync(wranglerBin, ['--install-skills=false', ...args], {
		encoding: 'utf8',
		env: process.env
	});
}

/** Wrangler may print a skills banner before JSON on stdout. */
function parseWranglerJson(output) {
	const trimmed = output.trim();
	try {
		return JSON.parse(trimmed);
	} catch {
		const start = trimmed.indexOf('[');
		const end = trimmed.lastIndexOf(']');
		if (start === -1 || end === -1 || end < start) {
			throw new Error(`wrangler output did not contain JSON array: ${trimmed.slice(0, 200)}`);
		}
		return JSON.parse(trimmed.slice(start, end + 1));
	}
}

function listNamespaces() {
	const output = wrangler('kv', 'namespace', 'list');
	const parsed = parseWranglerJson(output);
	if (!Array.isArray(parsed)) {
		throw new Error('wrangler kv namespace list did not return a JSON array');
	}
	return parsed;
}

function findNamespaceId(namespaces, title) {
	const hit = namespaces.find((entry) => entry.title === title);
	return hit?.id ?? null;
}

function ensureNamespaceId(title) {
	let namespaces = listNamespaces();
	let id = findNamespaceId(namespaces, title);
	if (id) {
		console.log(`[ensure-kv] reusing existing namespace "${title}" (${id})`);
		return id;
	}

	console.log(`[ensure-kv] creating namespace "${title}"`);
	wrangler('kv', 'namespace', 'create', title);

	namespaces = listNamespaces();
	id = findNamespaceId(namespaces, title);
	if (!id) {
		throw new Error(`[ensure-kv] namespace "${title}" not found after create`);
	}
	console.log(`[ensure-kv] created namespace "${title}" (${id})`);
	return id;
}

function validateNamespaceId(id) {
	if (!KV_ID_RE.test(id)) {
		throw new Error(`[ensure-kv] invalid namespace id: ${id}`);
	}
}

function injectId(configPath, placeholder, id) {
	const absPath = resolve(repoRoot, configPath);
	const original = readFileSync(absPath, 'utf8');
	if (!original.includes(placeholder)) {
		if (original.includes(id)) {
			console.log(`[ensure-kv] ${configPath} already pinned to ${id}`);
			return;
		}
		throw new Error(`[ensure-kv] placeholder "${placeholder}" not found in ${configPath}`);
	}
	const updated = original.replaceAll(placeholder, id);
	writeFileSync(absPath, updated, 'utf8');
	console.log(`[ensure-kv] pinned id into ${configPath}`);
}

function main() {
	const opts = parseArgs(process.argv.slice(2));
	const id = ensureNamespaceId(opts.title);
	validateNamespaceId(id);
	injectId(opts.config, opts.placeholder, id);
}

main();
