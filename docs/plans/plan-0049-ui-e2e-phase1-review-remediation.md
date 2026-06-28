# Plan 0049 — UI e2e Phase 1 review remediation

**Status:** Complete (remediations applied)  
**Date:** 2026-06-28  
**Related:** [plan-0047-ui-browser-e2e.md](./plan-0047-ui-browser-e2e.md),
FOR-220, FOR-221, FOR-222, FOR-223, FOR-224, branch
`robin/for-221-ui-e2e-phase1`

## 1. Review scope summary

Graphite metadata unavailable; reviewed **uncommitted working tree** on
`robin/for-221-ui-e2e-phase1` vs `origin/main` (no commits, no PR yet).

Deliverables: `@mandate/ui-e2e` hermetic Playwright suite, Privy OTP login seam,
mock BFF/auth, CI workflow, plan-0047.

Custody invariants (ARC-0022 I2/I3): **upheld** — no change to owner topology or
kill-switch semantics; mock path is test-only behind `PUBLIC_E2E_PRIVY=mock`.

## 2. Remediation items

| ID | Sev | Branch | Tasks | Acceptance criteria |
| -- | --- | ------ | ----- | ------------------- |
| R1 | High | current | Commit, push, open PR | Single commit or logical series; `pnpm check`, `pnpm test`, `pnpm test:e2e:ui` green in CI; PR links FOR-220–224 |
| R2 | Medium | current | Document `PUBLIC_E2E_PRIVY` in [service-secrets.md](../service-secrets.md) | Row under UI public vars: e2e/CI only, **never prod** Doppler or Pages |
| R3 | Medium | current | Wire `resetPrivyClient()` → `resetMockPrivyAuthState()` when mock enabled | Unit test: reset clears mock auth; optional Playwright `beforeEach` if needed |
| R4 | Medium | current | Export mock wallet from `@mandate/ui` test surface or re-export in fixture from one source | Fixture imports `E2E_MOCK_WALLET_ADDRESS` from shared constant; no duplicate string |
| R5 | Low | current | OTP input: `inputmode="numeric"`, `maxlength`, optional `type="password"` | Accessible login unchanged; e2e still finds `data-testid="privy-otp"` |
| R6 | Low | post-merge | Extend `audit:client-secrets` or add CI step: prod build must not contain `E2E_MOCK_SIGNATURE_HEX` / mock-only strings | `test.yml` build without `PUBLIC_E2E_PRIVY=mock` passes audit |
| R7 | Low | deferred (FOR-225+) | Phase 2 integration tier + `@mandate/ui-e2e-kit` extraction per plan-0047 / ARC-0024 | Out of Phase 1 scope |

## 3. Branch assignment

### Current stack (`robin/for-221-ui-e2e-phase1`)

- **R1–R5** before merge (R1 mandatory).
- **R6** may land in same PR or immediate follow-up on `main`.

### New stack branch

- None required unless R6 is deferred.

### Sibling repo / post-merge

- None for Phase 1 hermetic tier.

## 4. Deferred (Low)

- Playwright spec for logout → OTP flow reset (`otpSent` cleared).
- `global-setup.ts` run-id consumption in specs (currently write-only).
- Faster local iteration doc (vite dev + manual baseURL) in ui-e2e README.
