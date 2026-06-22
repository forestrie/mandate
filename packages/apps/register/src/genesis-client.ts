import { decode as decodeCbor } from 'cbor-x';
import { GenesisClientError } from './genesis-client-error.js';
import type { CoordinatorRegistrationStatus } from './coordinator-registration-status.js';
import type { GenesisRegistrationResponse } from './genesis-registration-response.js';

export interface PostGenesisInput {
	forestR: string;
	body: Uint8Array;
	onboardToken: string;
	webhookUrl?: string;
	canopyBaseUrl: string;
	fetchImpl?: typeof fetch;
}

function normalizeBaseUrl(url: string): string {
	return url.trim().replace(/\/$/, '');
}

function assertCoordinatorOk(coordinator: CoordinatorRegistrationStatus | undefined): void {
	if (!coordinator) {
		throw new GenesisClientError('genesis response missing coordinator forward status');
	}
	if (coordinator.publicRoot !== 'ok' || coordinator.webhook !== 'ok') {
		throw new GenesisClientError(
			`coordinator registration incomplete (publicRoot=${coordinator.publicRoot}, webhook=${coordinator.webhook})`,
			503,
			coordinator.detail
		);
	}
}

/** POST payment-authoritative forest genesis; canopy brokers coordinator registration. */
export async function postGenesis(input: PostGenesisInput): Promise<GenesisRegistrationResponse> {
	const fetchImpl = input.fetchImpl ?? fetch;
	const base = normalizeBaseUrl(input.canopyBaseUrl);
	const query = input.webhookUrl ? `?webhookUrl=${encodeURIComponent(input.webhookUrl)}` : '';
	const url = `${base}/api/forest/${input.forestR}/genesis${query}`;

	const response = await fetchImpl(url, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${input.onboardToken}`,
			'Content-Type': 'application/cbor',
			Accept: 'application/cbor'
		},
		body: input.body as BodyInit
	});

	if (!response.ok) {
		const detail = await response.text().catch(() => '');
		throw new GenesisClientError(
			`genesis POST failed: ${response.status}`,
			response.status,
			detail.slice(0, 500)
		);
	}

	const raw = new Uint8Array(await response.arrayBuffer());
	const decoded = decodeCbor(raw) as GenesisRegistrationResponse;

	if (input.webhookUrl) {
		assertCoordinatorOk(decoded.coordinator);
	}

	return decoded;
}
