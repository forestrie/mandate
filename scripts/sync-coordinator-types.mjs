#!/usr/bin/env node
/**
 * Copy delegation-coordinator UX types from a sibling canopy checkout.
 *
 * Usage:
 *   node scripts/sync-coordinator-types.mjs
 *   CANOPY_ROOT=/path/to/canopy node scripts/sync-coordinator-types.mjs
 */

import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const canopyRoot = process.env.CANOPY_ROOT ?? resolve(repoRoot, '../canopy');
const sourceDir = join(canopyRoot, 'packages/apps/delegation-coordinator/src/types');
const targetDir = join(repoRoot, 'src/lib/coordinator/types');

if (!existsSync(sourceDir)) {
	console.error(`Coordinator types not found at ${sourceDir}`);
	console.error('Set CANOPY_ROOT to your canopy checkout.');
	process.exit(1);
}

mkdirSync(targetDir, { recursive: true });

const files = readdirSync(sourceDir).filter((name) => name.endsWith('.ts'));
for (const file of files) {
	cpSync(join(sourceDir, file), join(targetDir, file), { force: true });
	console.log(`synced ${file}`);
}

console.log(`Done. ${files.length} files in ${targetDir}`);
