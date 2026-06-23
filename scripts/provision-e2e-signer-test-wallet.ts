/**
 * Provision a fresh user-owned E2E signer test wallet and onboard mandate as
 * additional signer. Prints Doppler keys to set (stdout JSON).
 *
 *   ARCHIVE_WALLET_ID=vbd6kev61oe46vsp29hw281b task provision:e2e-signer-test-wallet
 *
 * Note: Privy wallet archive is dashboard-only if API PATCH does not support it.
 */
import { generateKeyPairSync } from 'node:crypto';
import { onboardModeCWallet, PrivyRestClient } from '../packages/libs/privy-admin/src/index.ts';

const APP_ID = process.env.MANDATE_PRIVY_APP_ID;
const APP_SECRET = process.env.MANDATE_PRIVY_APP_SECRET;
const API_BASE = process.env.MANDATE_PRIVY_API_BASE?.replace(/\/$/, '');
const MANDATE_SIGNER_ID = process.env.MANDATE_PRIVY_SIGNER_ID;
const SIGNER_URL = process.env.MANDATE_SIGNER_URL ?? 'https://mandate-signer.example/v1/sign';
const ARCHIVE_WALLET_ID = process.env.ARCHIVE_WALLET_ID?.trim();

const LOG_ID = 'a1b2c3d4e5f678901234567890abcdef';
const KEY_REF = 'signer-test-wallet';

function requireEnv(name: string, value: string | undefined): string {
	if (!value?.trim()) {
		console.error(`missing required env: ${name}`);
		process.exit(1);
	}
	return value.trim();
}

function ownerAuthKeyFromKeyPair(privateKeyDer: Buffer): string {
	return `wallet-auth:${privateKeyDer.toString('base64')}`;
}

function basicAuthHeader(): string {
	return `Basic ${Buffer.from(`${APP_ID}:${APP_SECRET}`).toString('base64')}`;
}

async function privyFetch(
	path: string,
	opts: { method?: string; body?: Record<string, unknown> } = {}
): Promise<Record<string, unknown>> {
	const method = opts.method ?? 'GET';
	const url = `${API_BASE}${path}`;
	const response = await fetch(url, {
		method,
		headers: {
			Authorization: basicAuthHeader(),
			'privy-app-id': APP_ID!,
			'Content-Type': 'application/json'
		},
		body: method === 'GET' ? undefined : JSON.stringify(opts.body ?? {})
	});
	const text = await response.text();
	if (!response.ok) {
		throw new Error(`Privy ${method} ${path} failed: ${response.status} ${text}`);
	}
	return text ? (JSON.parse(text) as Record<string, unknown>) : {};
}

async function main(): Promise<void> {
	requireEnv('MANDATE_PRIVY_APP_ID', APP_ID);
	requireEnv('MANDATE_PRIVY_APP_SECRET', APP_SECRET);
	requireEnv('MANDATE_PRIVY_API_BASE', API_BASE);
	requireEnv('MANDATE_PRIVY_SIGNER_ID', MANDATE_SIGNER_ID);
	requireEnv('MANDATE_PRIVY_AUTHORIZATION_KEY', process.env.MANDATE_PRIVY_AUTHORIZATION_KEY);

	const { privateKey, publicKey } = generateKeyPairSync('ec', {
		namedCurve: 'P-256',
		privateKeyEncoding: { type: 'pkcs8', format: 'der' },
		publicKeyEncoding: { type: 'spki', format: 'der' }
	});
	const ownerAuthKey = ownerAuthKeyFromKeyPair(privateKey);
	const publicKeyB64 = Buffer.from(publicKey).toString('base64');

	console.error('Creating owner key quorum…');
	const quorum = (await privyFetch('/v1/key_quorums', {
		method: 'POST',
		body: {
			display_name: `E2E signer test owner ${new Date().toISOString()}`,
			public_keys: [publicKeyB64],
			authorization_threshold: 1
		}
	})) as { id: string };

	console.error('Creating user-owned wallet…');
	const wallet = (await privyFetch('/v1/wallets', {
		method: 'POST',
		body: {
			chain_type: 'ethereum',
			owner_id: quorum.id
		}
	})) as { id: string; address?: string };

	console.error('Onboarding mandate as additional signer…');
	await onboardModeCWallet(
		new PrivyRestClient({
			appId: APP_ID!,
			appSecret: APP_SECRET!,
			apiBase: API_BASE!
		}),
		{
			walletId: wallet.id,
			mandateSignerId: MANDATE_SIGNER_ID!,
			keyRef: KEY_REF,
			logId: LOG_ID,
			signerUrl: SIGNER_URL,
			ownerAuthorizationKey: ownerAuthKey
		}
	);

	if (ARCHIVE_WALLET_ID) {
		console.error(
			`Retired wallet ${ARCHIVE_WALLET_ID}: archive manually in Privy dashboard ` +
				'(API PATCH does not accept archived flag).'
		);
	}

	const walletDetail = (await privyFetch(`/v1/wallets/${wallet.id}`)) as { address?: string };
	console.log(
		JSON.stringify(
			{
				E2E_SIGNER_TEST_PRIVY_WALLET_ID: wallet.id,
				E2E_SIGNER_TEST_WALLET_ADDRESS: walletDetail.address ?? wallet.address,
				E2E_SIGNER_TEST_OWNER_AUTH_KEY: ownerAuthKey
			},
			null,
			2
		)
	);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
