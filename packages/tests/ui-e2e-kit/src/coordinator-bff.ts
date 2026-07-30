import type { Page } from '@playwright/test';
import type {
	CertificateSubmitResponse,
	ChallengeRequest,
	ChallengeResponse,
	EnabledResponse,
	PendingEntry,
	PendingListResponse,
	ProblemDetails,
	SessionExchangeResponse
} from '@mandate/coordinator-types';

export interface CoordinatorMockOptions {
	pendingEntries?: PendingEntry[];
	pendingError?: ProblemDetails;
	certificateSubmitError?: ProblemDetails;
	onCertificateSubmit?: (body: unknown) => void;
	enabledByLogId?: Record<string, EnabledResponse>;
	/** Recorded when the wizard posts `logs/{id}/signing-route`. */
	onSigningRouteSet?: (logId: string, body: { mode: string }) => void;
}

function defaultEnabled(enabled = true): EnabledResponse {
	return {
		enabled,
		userEnabled: enabled,
		operatorEnabled: enabled
	};
}

function problemJson(problem: ProblemDetails): { status: number; body: string } {
	return {
		status: problem.status,
		body: JSON.stringify(problem)
	};
}

/** Install browser-level mocks for mandate BFF and control-plane auth routes. */
export async function installCoordinatorMocks(
	page: Page,
	options: CoordinatorMockOptions = {}
): Promise<void> {
	const enabledState = new Map<string, EnabledResponse>(
		Object.entries(options.enabledByLogId ?? {})
	);
	let certificateSubmitCount = 0;

	await page.route('**/api/auth/challenge', async (route) => {
		if (route.request().method() !== 'POST') {
			await route.fallback();
			return;
		}
		const body = route.request().postDataJSON() as ChallengeRequest;
		const now = Math.floor(Date.now() / 1000);
		const response: ChallengeResponse = {
			version: 'wcc-1',
			nonce: 'e2e-nonce',
			authLogId: body.authLogId,
			scopes: body.scopes,
			issuedAt: now,
			expiresAt: now + 3600,
			domain: '127.0.0.1',
			coordinatorOrigin: 'http://127.0.0.1:4173'
		};
		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify(response)
		});
	});

	await page.route('**/api/auth/session', async (route) => {
		if (route.request().method() !== 'POST') {
			await route.fallback();
			return;
		}
		const body = route.request().postDataJSON() as {
			envelope: { authLogId: string; scopes: string[] };
		};
		const now = Math.floor(Date.now() / 1000);
		const response: SessionExchangeResponse = {
			token: 'e2e-session-token',
			expiresAt: now + 3600,
			authLogId: body.envelope.authLogId,
			scopes: body.envelope.scopes as SessionExchangeResponse['scopes']
		};
		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify(response)
		});
	});

	await page.route('**/api/coordinator/**', async (route) => {
		const request = route.request();
		const url = new URL(request.url());
		const path = url.pathname.replace(/^.*\/api\/coordinator\//, '');
		const method = request.method();

		if (method === 'GET' && path.startsWith('delegations/pending')) {
			if (options.pendingError) {
				const { status, body } = problemJson(options.pendingError);
				await route.fulfill({ status, contentType: 'application/problem+json', body });
				return;
			}
			const entries = options.pendingEntries ?? [];
			const response: PendingListResponse = {
				entries,
				offset: 0,
				limit: 50,
				shardCount: 1
			};
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify(response)
			});
			return;
		}

		if (method === 'POST' && path === 'delegations/certificate') {
			if (options.certificateSubmitError) {
				const { status, body } = problemJson(options.certificateSubmitError);
				await route.fulfill({ status, contentType: 'application/problem+json', body });
				return;
			}
			certificateSubmitCount += 1;
			options.onCertificateSubmit?.(request.postDataJSON());
			const response: CertificateSubmitResponse = {
				ok: true,
				certificateKey: `e2e-cert-${certificateSubmitCount}`
			};
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify(response)
			});
			return;
		}

		const enabledMatch = path.match(/^logs\/([^/]+)\/enabled$/);
		if (enabledMatch) {
			const logId = enabledMatch[1]!;
			if (method === 'GET') {
				const response = enabledState.get(logId) ?? defaultEnabled(true);
				await route.fulfill({
					status: 200,
					contentType: 'application/json',
					body: JSON.stringify(response)
				});
				return;
			}
			if (method === 'PUT') {
				const body = request.postDataJSON() as { enabled: boolean };
				const response: EnabledResponse = {
					enabled: body.enabled,
					userEnabled: body.enabled,
					operatorEnabled: body.enabled
				};
				enabledState.set(logId, response);
				await route.fulfill({
					status: 200,
					contentType: 'application/json',
					body: JSON.stringify(response)
				});
				return;
			}
		}

		const signingRouteMatch = path.match(/^logs\/([^/]+)\/signing-route$/);
		if (signingRouteMatch && method === 'POST') {
			const body = request.postDataJSON() as { mode: string };
			options.onSigningRouteSet?.(signingRouteMatch[1]!, body);
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ ok: true })
			});
			return;
		}

		await route.fulfill({
			status: 404,
			contentType: 'application/problem+json',
			body: JSON.stringify({
				type: 'about:blank',
				title: 'Not Found',
				status: 404,
				detail: `Unmocked coordinator path: ${method} ${path}`
			} satisfies ProblemDetails)
		});
	});
}
