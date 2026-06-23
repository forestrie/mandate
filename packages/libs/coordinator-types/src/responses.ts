import type { PendingEntry } from './pending-entry.js';

/** GET /api/delegations/pending response (worker aggregate). */
export interface PendingListResponse {
	entries: PendingEntry[];
	offset: number;
	limit: number;
	shardCount: number;
}

/** POST /api/delegations/certificate success response. */
export interface CertificateSubmitResponse {
	ok: true;
	certificateKey: string;
}

/** @deprecated use CertificateSubmitResponse */
export interface MaterialSubmitResponse {
	ok: true;
	materialKey: string;
}

/** POST /api/logs/{logId}/signing-route success response. */
export interface SigningRouteMutationResponse {
	ok: true;
}

/** application/problem+json from coordinator. */
export interface ProblemDetails {
	type: string;
	title: string;
	status: number;
	detail?: string;
}

export type {
	CustodyKeysRequest,
	CustodyKeysResponse,
	PendingEntry,
	PendingHintRequest,
	SigningRoute,
	SigningRouteMode,
	SubmitMaterialRequest
} from './types.js';
