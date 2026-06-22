import { PUBLIC_COORDINATOR_BFF_BASE } from '$env/static/public';
import type {
	EnabledResponse,
	MaterialSubmitResponse,
	PendingListResponse,
	ProblemDetails,
	PutEnabledRequest,
	SubmitMaterialRequest
} from '@mandate/coordinator-types';

function bffBase(): string {
	return (PUBLIC_COORDINATOR_BFF_BASE || '/api/coordinator').replace(/\/$/, '');
}

async function bffFetch<T>(path: string, init?: RequestInit): Promise<T> {
	const url = `${bffBase()}/${path.replace(/^\//, '')}`;
	const response = await fetch(url, {
		...init,
		headers: {
			'Content-Type': 'application/json',
			...init?.headers
		}
	});
	if (!response.ok) {
		let detail = response.statusText;
		try {
			const problem = (await response.json()) as ProblemDetails;
			detail = problem.detail ?? problem.title ?? detail;
		} catch {
			// ignore parse errors
		}
		throw new Error(detail);
	}
	return (await response.json()) as T;
}

export async function listPendingDelegations(
	authLogId: string,
	opts?: { offset?: number; limit?: number }
): Promise<PendingListResponse> {
	const params = new URLSearchParams({ authLogId });
	if (opts?.offset !== undefined) params.set('offset', String(opts.offset));
	if (opts?.limit !== undefined) params.set('limit', String(opts.limit));
	return bffFetch<PendingListResponse>(`delegations/pending?${params}`);
}

export async function submitDelegationMaterial(
	body: SubmitMaterialRequest
): Promise<MaterialSubmitResponse> {
	return bffFetch<MaterialSubmitResponse>('delegations/material', {
		method: 'POST',
		body: JSON.stringify(body)
	});
}

export async function getLogDelegationEnabled(logId: string): Promise<EnabledResponse> {
	return bffFetch<EnabledResponse>(`logs/${encodeURIComponent(logId)}/enabled`);
}

export async function setLogDelegationEnabled(
	logId: string,
	enabled: boolean
): Promise<EnabledResponse> {
	const body: PutEnabledRequest = { enabled };
	return bffFetch<EnabledResponse>(`logs/${encodeURIComponent(logId)}/enabled`, {
		method: 'PUT',
		body: JSON.stringify(body)
	});
}
