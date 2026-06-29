import * as esbuild from 'esbuild';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const entry = resolve(here, '../../apps/register/src/cli.ts');
const outdir = resolve(here, 'dist');
const outfile = resolve(outdir, 'cli.js');

mkdirSync(outdir, { recursive: true });

await esbuild.build({
	entryPoints: [entry],
	bundle: true,
	platform: 'node',
	target: 'node22',
	format: 'esm',
	outfile,
	sourcemap: true,
	logLevel: 'info'
});

console.log(`wrote ${outfile}`);
