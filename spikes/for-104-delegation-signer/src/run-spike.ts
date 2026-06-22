#!/usr/bin/env node
import {
	assertAddressDerivation,
	createLocalSecpBackend,
	generateDelegatedPublicKeyCbor,
	generateTestRoot,
	verifyBackend
} from './harness.js';
import { createGcpKmsBackendFromEnv } from './gcp-kms-backend.js';
import { createPrivyBackendFromEnv } from './privy-backend.js';

async function main(): Promise<void> {
	const root = generateTestRoot();
	assertAddressDerivation(root);
	const delegatedPublicKeyCbor = await generateDelegatedPublicKeyCbor();

	const local = {
		name: 'local-secp (control)',
		mode: 'mock' as const,
		backend: createLocalSecpBackend(root.privateKey)
	};
	const privy = { name: 'privy', ...createPrivyBackendFromEnv(root.privateKey) };
	const gcp = {
		name: 'gcp-kms',
		...createGcpKmsBackendFromEnv(root.privateKey, root.rootSignerAddress)
	};
	const backends = [local, privy, gcp];

	console.log('FOR-104 delegation signer spike');
	console.log(`rootSignerAddress: ${root.rootSignerAddressHex}`);
	console.log(`SPIKE_LIVE=${process.env.SPIKE_LIVE ?? '0'}`);
	console.log('');

	const results: Array<{
		name: string;
		mode: string;
		ok: boolean;
		latencyMs: number;
		certificateBytes: number;
	}> = [];

	for (const { name, mode, backend } of backends) {
		const result = await verifyBackend(backend, root.rootSignerAddress, delegatedPublicKeyCbor);
		results.push({ name, mode, ...result });
		const status = result.ok ? 'PASS' : 'FAIL';
		console.log(
			`${status} ${name} [${mode}] latency=${result.latencyMs.toFixed(1)}ms cert=${result.certificateBytes}B`
		);
	}

	const allPass = results.every((r) => r.ok);
	if (!allPass) {
		process.exitCode = 1;
		console.error('\nOne or more backends failed verifyBackend gate.');
		return;
	}

	console.log('\nAll backends passed buildDelegationCertificateKs256WithSigner + verify.');
	if (process.env.SPIKE_LIVE !== '1') {
		console.log('Flip to live: SPIKE_LIVE=1 with Privy or GCP env vars (see README.md).');
	}
}

main().catch((err) => {
	console.error(err);
	process.exitCode = 1;
});
