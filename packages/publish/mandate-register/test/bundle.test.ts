import { spawn } from 'node:child_process';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

const pkgRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const cliPath = resolve(pkgRoot, 'bin/mandate-register.mjs');

function runCli(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
	return new Promise((resolvePromise, reject) => {
		const child = spawn(process.execPath, [cliPath, ...args], {
			cwd: pkgRoot,
			env: process.env,
			stdio: ['ignore', 'pipe', 'pipe']
		});
		let stdout = '';
		let stderr = '';
		child.stdout.on('data', (c: Buffer) => {
			stdout += c.toString();
		});
		child.stderr.on('data', (c: Buffer) => {
			stderr += c.toString();
		});
		child.on('error', reject);
		child.on('close', (code) => {
			resolvePromise({ code: code ?? 1, stdout, stderr });
		});
	});
}

describe('@forestrie/mandate-register bundle', () => {
	beforeAll(() => {
		execFileSync(process.execPath, ['build.mjs'], { cwd: pkgRoot, stdio: 'inherit' });
	});

	it('prints top-level help', async () => {
		const result = await runCli([]);
		expect(result.code).toBe(0);
		expect(result.stdout).toMatch(/mandate-register/);
		expect(result.stdout).toMatch(/provision/);
	});

	it('prints provision usage on missing args', async () => {
		const result = await runCli(['provision']);
		expect(result.code).not.toBe(0);
		expect(result.stderr).toMatch(/Usage: mandate-register provision/);
	});
});
