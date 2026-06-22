import type { PolicyCreateRequest } from './policy-create-request.js';
import type { PolicyResponse } from './policy-response.js';
import { buildPrivyAuthorizationSignature } from './authorization-signature.js';
import type { PrivyAdminConfig } from './privy-config.js';
import { PrivyRestError } from './privy-rest-error.js';

const DEFAULT_API_BASE = 'https://api.privy.io';
const DEFAULT_REQUEST_EXPIRY_SKEW_MS = 60_000;

export interface PrivyAuthorizedRequestOptions {
	method: string;
	path: string;
	body?: Record<string, unknown>;
	authorizationKey?: string;
	requestExpiryMs?: number;
}

/** Thin Privy REST client (Basic auth + optional owner authorization signature). */
export class PrivyRestClient {
	private readonly apiBase: string;
	private readonly fetchImpl: typeof fetch;

	constructor(private readonly config: PrivyAdminConfig) {
		this.apiBase = (config.apiBase ?? DEFAULT_API_BASE).replace(/\/$/, '');
		this.fetchImpl = config.fetchImpl ?? fetch;
	}

	get appId(): string {
		return this.config.appId;
	}

	async createPolicy(body: PolicyCreateRequest): Promise<PolicyResponse> {
		const response = await this.request({
			method: 'POST',
			path: '/v1/policies',
			body: body as unknown as Record<string, unknown>
		});
		return (await response.json()) as PolicyResponse;
	}

	async getPolicy(policyId: string): Promise<PolicyResponse> {
		const response = await this.request({
			method: 'GET',
			path: `/v1/policies/${policyId}`
		});
		return (await response.json()) as PolicyResponse;
	}

	async request(opts: PrivyAuthorizedRequestOptions): Promise<Response> {
		const url = `${this.apiBase}${opts.path}`;
		const body = opts.body ?? {};
		const requestExpiryMs = opts.requestExpiryMs ?? Date.now() + DEFAULT_REQUEST_EXPIRY_SKEW_MS;
		const authSig = await buildPrivyAuthorizationSignature({
			method: opts.method,
			url,
			body: opts.method === 'GET' ? {} : body,
			appId: this.config.appId,
			authorizationKey: opts.authorizationKey,
			requestExpiryMs
		});

		const headers: Record<string, string> = {
			Authorization: this.basicAuthHeader(),
			'privy-app-id': this.config.appId,
			'Content-Type': 'application/json',
			'privy-request-expiry': String(requestExpiryMs)
		};
		if (authSig) {
			headers['privy-authorization-signature'] = authSig;
		}

		const response = await this.fetchImpl(url, {
			method: opts.method,
			headers,
			body: opts.method === 'GET' ? undefined : JSON.stringify(body)
		});

		if (!response.ok) {
			const text = await response.text();
			throw new PrivyRestError(
				`Privy ${opts.method} ${opts.path} failed: ${response.status}`,
				response.status,
				text
			);
		}
		return response;
	}

	private basicAuthHeader(): string {
		const encoded = Buffer.from(`${this.config.appId}:${this.config.appSecret}`).toString('base64');
		return `Basic ${encoded}`;
	}
}
