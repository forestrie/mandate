import type { EnabledResponse } from '@mandate/coordinator-types';

export type RowStatus = 'pending' | 'signing' | 'signed' | 'failed' | 'submitted';

export type StatusFilter = 'all' | RowStatus;

export interface EnabledBadgeLabels {
	user: string;
	operator: string;
	effective: string;
}

export function enabledBadgeLabels(response: EnabledResponse): EnabledBadgeLabels {
	return {
		user: response.userEnabled ? 'User on' : 'User paused',
		operator: response.operatorEnabled ? 'Operator on' : 'Operator paused',
		effective: response.enabled ? 'Signing active' : 'Signing paused'
	};
}

export function effectiveEnabledVariant(
	enabled: boolean
): 'default' | 'secondary' | 'outline' {
	return enabled ? 'default' : 'outline';
}

export function rowStatusStorageKey(authLogId: string): string {
	return `mandate.delegations.rowStatus.${authLogId.trim().toLowerCase()}`;
}

export function loadRowStatus(authLogId: string): Record<string, RowStatus> {
	if (typeof localStorage === 'undefined' || !authLogId.trim()) return {};
	try {
		const raw = localStorage.getItem(rowStatusStorageKey(authLogId));
		if (!raw) return {};
		const parsed = JSON.parse(raw) as Record<string, RowStatus>;
		return parsed && typeof parsed === 'object' ? parsed : {};
	} catch {
		return {};
	}
}

export function saveRowStatus(authLogId: string, status: Record<string, RowStatus>): void {
	if (typeof localStorage === 'undefined' || !authLogId.trim()) return;
	localStorage.setItem(rowStatusStorageKey(authLogId), JSON.stringify(status));
}

/** Merge stored status with current pending ids; absent pending rows become submitted. */
export function reconcileRowStatus(
	stored: Record<string, RowStatus>,
	pendingIds: string[]
): Record<string, RowStatus> {
	const pendingSet = new Set(pendingIds);
	const next: Record<string, RowStatus> = {};
	for (const id of pendingIds) {
		const current = stored[id];
		next[id] = current === 'signing' ? 'pending' : (current ?? 'pending');
	}
	for (const [id, status] of Object.entries(stored)) {
		if (pendingSet.has(id)) continue;
		if (status === 'signed' || status === 'submitted') {
			next[id] = 'submitted';
		}
	}
	return next;
}

export function statusLabel(status: RowStatus): string {
	switch (status) {
		case 'signing':
			return 'Signing…';
		case 'signed':
			return 'Submitted';
		case 'submitted':
			return 'Submitted (cleared)';
		case 'failed':
			return 'Failed';
		default:
			return 'Pending';
	}
}

export function statusVariant(status: RowStatus): 'default' | 'secondary' | 'outline' {
	switch (status) {
		case 'signed':
		case 'submitted':
			return 'default';
		case 'signing':
			return 'secondary';
		case 'failed':
			return 'outline';
		default:
			return 'outline';
	}
}

export function matchesStatusFilter(status: RowStatus, filter: StatusFilter): boolean {
	if (filter === 'all') return true;
	if (filter === 'signed') return status === 'signed' || status === 'submitted';
	return status === filter;
}
