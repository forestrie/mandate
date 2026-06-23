import { PUBLIC_COORDINATOR_BFF_BASE } from '$env/static/public';
import type {
	CertificateSubmitResponse,
	ControlPlaneScope,
	EnabledResponse,
	PendingListResponse,
	ProblemDetails,
	PutEnabledRequest,
	SubmitDelegationCertificateRequest
} from '@mandate/coordinator-types';
import { controlPlaneAuthHeaders } from './control-plane-session.js';

function bffBase(): string {
	return (PUBLIC_COORDINATOR_BFF_BASE || '/api/coordinator').replace(/\/$/, '');
}

async function bffFetch<T>(
	path: string,
	init?: RequestInit,
	authLogId?: string,
	scopes?: ControlPlaneScope[]
): Promise<T> {
	const url = `${bffBase()}/${path.replace(/^\//, '')}`;
	const authHeaders =
		authLogId && scopes?.length
			? await controlPlaneAuthHeaders(authLogId, scopes)
			: {};
	const response = await fetch(url, {
		...init,
		headers: {
			'Content-Type': 'application/json',
			...authHeaders,
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
	return bffFetch<PendingListResponse>(
		`delegations/pending?${params}`,
		undefined,
		authLogId,
		['delegations:read']
	);
}

export async function submitDelegationCertificate(
	body: SubmitDelegationCertificateRequest
): Promise<CertificateSubmitResponse> {
	return bffFetch<CertificateSubmitResponse>('delegations/certificate', {
		method: 'POST',
		body: JSON.stringify(body)
	});
}

/** @deprecated use submitDelegationCertificate */
export const submitDelegationMaterial = submitDelegationCertificate;

export async function getLogDelegationEnabled(logId: string): Promise<EnabledResponse> {
	return bffFetch<EnabledResponse>(
		`logs/${encodeURIComponent(logId)}/enabled`,
		undefined,
		logId,
		['logs:enabled:read']
	);
}

export async function setLogDelegationEnabled(
	logId: string,
	enabled: boolean
): Promise<EnabledResponse> {
	const body: PutEnabledRequest = { enabled };
	return bffFetch<EnabledResponse>(
		`logs/${encodeURIComponent(logId)}/enabled`,
		{
			method: 'PUT',
			body: JSON.stringify(body)
		},
		logId,
		['logs:enabled:write']
	);
}
