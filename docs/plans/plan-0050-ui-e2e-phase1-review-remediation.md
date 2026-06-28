# Plan 0050 — UI e2e Phase 1 review remediation

**Status:** Complete
**Date:** 2026-06-28
**Related:** [plan-0047-ui-browser-e2e.md](./plan-0047-ui-browser-e2e.md),
[plan-0049-ui-e2e-phase1-review-remediation.md](./plan-0049-ui-e2e-phase1-review-remediation.md),
FOR-220, FOR-221, FOR-222, FOR-223, FOR-224, branch
`robin/for-221-ui-e2e-phase1`

## Remediation items

| ID  | Sev    | Status   | Summary                                                                                                |
| --- | ------ | -------- | ------------------------------------------------------------------------------------------------------ |
| R1  | High   | Done     | Mock Privy gated by build-time `VITE_E2E_PRIVY_MOCK=true`; prod CI build + `audit:client-secrets` pass |
| R2  | High   | Done     | Playwright `webServer.env` passes `VITE_E2E_PRIVY_MOCK` to build + preview                             |
| R3  | High   | Done     | Commit, push, PR (FOR-220–224)                                                                         |
| R4  | Medium | Done     | Unauthenticated spec asserts login affordance after Load pending (empty state covered elsewhere)       |
| R5  | Medium | Done     | `@mandate/ui/e2e/mock-client` export; ui-e2e imports package surface                                   |
| R6  | Medium | Done     | No `PUBLIC_E2E_PRIVY` in prod CI — mock uses Vite env only                                             |
| R7  | Low    | Deferred | Wrangler coordinator vars in webServer                                                                 |
| R8  | Low    | Deferred | Logout e2e; global-setup run-id; vite-dev fast path                                                    |

## R1 notes

`import.meta.env.VITE_E2E_PRIVY_MOCK === 'true'` dead-branch elimination removes
mock-client from production client chunks. Dynamic import remains for e2e builds
only.
