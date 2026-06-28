import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const runIdFile = resolve(__dirname, '.e2e-run-id');

export default async function globalSetup(): Promise<void> {
	const id = randomUUID();
	writeFileSync(runIdFile, id, 'utf8');
	process.env.E2E_RUN_ID = id;
}
