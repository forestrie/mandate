#!/usr/bin/env node
/**
 * Fail if server-only env names appear in the client build output.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const clientDir = resolve(__dirname, '../packages/apps/ui/.svelte-kit/output/client');
const forbidden = [
	'COORDINATOR_APP_TOKEN',
	'MANDATE_PRIVY_APP_SECRET',
	'e2e-mock-user',
	'Unsupported mock provider method'
];

if (!existsSync(clientDir)) {
	console.log('No client output yet; run pnpm build first.');
	process.exit(0);
}

function walk(dir) {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) walk(path);
		else if (/\.(js|css|html|json)$/.test(entry.name)) {
			const text = readFileSync(path, 'utf8');
			for (const needle of forbidden) {
				if (text.includes(needle)) {
					console.error(`Forbidden secret name found in client bundle: ${needle} (${path})`);
					process.exit(1);
				}
			}
		}
	}
}

walk(clientDir);
console.log('Client bundle secret audit passed.');
