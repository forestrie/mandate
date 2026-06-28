# Plan 0048 — Tier 1 release + Tier 2 (FOR-159–162) review remediation

**Status:** DRAFT  
**Date:** 2026-06-28  
**Ownership:** R1–R5, R7–R8, R9 → **univocity-tools** (active in a
parallel session — do not duplicate here). R6 → **mandate** (FORKING Path B′;
land after Pages deploy from that session).

**Related:** [FOR-148](https://linear.app/forestrie/issue/FOR-148),
[FOR-149](https://linear.app/forestrie/issue/FOR-149),
[FOR-156](https://linear.app/forestrie/issue/FOR-156),
[FOR-159](https://linear.app/forestrie/issue/FOR-159)–[FOR-162](https://linear.app/forestrie/issue/FOR-162),
[univocity #24](https://github.com/forestrie/univocity/pull/24),
[mandate #34](https://github.com/forestrie/mandate/pull/34),
[univocity-tools plan-0001](https://github.com/forestrie/univocity-tools/blob/main/docs/plans/plan-0001-tier2-browser-deploy.md)

## 1. Review scope summary

| Area | Range | Graphite | Status |
|------|-------|----------|--------|
| Tier 1 release (FOR-148 children) | `univocity-tools@main` (v0.6.0), `univocity@main` (v0.1.4), `mandate@main` (#34) | N/A | **Merged + released** |
| Tier 2 slices 1–4 (FOR-159–162) | `univocity-tools@main` ([963ea0f](https://github.com/forestrie/univocity-tools/commit/963ea0f)) | Merged | **Done** — remediations R2–R5 in [FOR-228](https://linear.app/forestrie/issue/FOR-228) follow-up |
| Mandate FORKING Path B′ | `mandate` PR pending | N/A | **Pending** — land with FOR-164 / post-remediation |

Graphite metadata unavailable for univocity-tools tier-2 branch; reviewed as
single working tree vs `main`.

## 2. Remediation items

### R1 — Commit and land Tier 2 stack (FOR-159–162)

| Field | Value |
|-------|-------|
| **Severity** | High |
| **Branch** | `robin/for-149-tier2-browser-deploy` (univocity-tools) |
| **Tasks** | Stage `packages/deploy-core`, `apps/deploy-web`, `scripts/check-browser-safe.ts`, ADR-0011, CI `check:browser-safe`, deployer refactors, `deploy-deploy-web.yml`, docs; open PR; merge after green CI |
| **Acceptance** | `origin/main` contains deploy-core + deploy-web; `bun run check` + `bun test` green on CI; FOR-159–162 marked Done |
| **Tests** | Existing deploy-core (19) + deploy-web (12) unit tests pass |

### R2 — KS256 ephemeral bootstrap key loss (FOR-162)

| Field | Value |
|-------|-------|
| **Severity** | High |
| **Branch** | Same tier-2 PR or follow-up on `robin/for-162-*` |
| **Tasks** | When `generateKs256BootstrapKey()` runs, surface **private key + address** with explicit “save before deploy” copy; block deploy until user confirms backup **or** document that generated KS256 address must be a separate custody decision from the deploy wallet |
| **Acceptance** | UI shows recoverable material for generated KS256; integration test asserts warning/confirm gate |
| **Invariant** | Genesis bootstrap key is independent of deploy EOA ([FORKING Step 1](https://github.com/forestrie/mandate/blob/main/FORKING.md)) |

### R3 — ES256 PEM backup warning

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Branch** | tier-2 stack |
| **Tasks** | Before deploy with ES256, require checkbox or modal: “I have stored the bootstrap PEM”; never log PEM to console |
| **Acceptance** | Deploy button disabled until acknowledged when `es256Pem` is non-empty |

### R4 — Chain ID vs wallet network

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Branch** | `apps/deploy-web/src/lib/deploy.ts` |
| **Tasks** | Read `eth_chainId` from provider; reject deploy when `chainId` input ≠ wallet chain (clear error) |
| **Acceptance** | Unit test: mismatch throws before `sendTransaction` |

### R5 — Client bundle secret audit for deploy-web

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Branch** | univocity-tools root |
| **Tasks** | Add `check:client-secrets` (mirror mandate `audit:client-secrets`) scanning `apps/deploy-web/dist` for forbidden patterns (`PRIVY_APP_SECRET`, `DEPLOY_KEY`, `PRIVATE_KEY`, etc.); wire into CI after `build` |
| **Acceptance** | CI fails if a deliberate secret string is embedded in the production bundle |

### R6 — Mandate FORKING Path B′ docs

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Branch** | `robin/for-164-forking-b-prime` (mandate) or stack with FOR-164 |
| **Tasks** | Commit local `FORKING.md` B′ section **after** Pages deploy is live; verify `univocity-deploy.pages.dev` returns 200 |
| **Acceptance** | PR merged; FORKING table lists B′ with working URL |

### R7 — Privy live integration tests

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **Branch** | tier-2 follow-up |
| **Tasks** | Un-skip `test/privy-integration.test.ts` behind `TESTING_PRIVY_*` env gate (document in deploy-web.md) |
| **Acceptance** | Optional CI job or documented manual matrix |

### R8 — Remove or wire `verify-testing-privy-token.ts`

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **Branch** | tier-2 stack |
| **Tasks** | Either use in privy-integration tests or delete until needed |
| **Acceptance** | No orphan security-sensitive module without tests |

### R9 — Univocity v0.1.4 duplicate release assets

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **Branch** | *Sibling repo / post-merge* — univocity GitHub Release hygiene |
| **Tasks** | Delete stale `+8a43fb5` tarballs from v0.1.4 release page (keep `dd54d38` + manifest) |
| **Acceptance** | Release page shows one build-id per archive type |

## 3. Branch assignment

| Item | Assignment |
|------|------------|
| R1–R5, R7–R8 | **New stack** on univocity-tools: `robin/for-149-tier2-browser-deploy` → optional child branches per FOR-159…162 if splitting PRs |
| R6 | **New mandate branch** `robin/for-164-forking-b-prime` (depends on R1 Pages deploy) |
| R9 | **Sibling repo** univocity — ops, not on current mandate branches |

## 4. Deferred (Low)

- R7 Privy live matrix (manual OK for first ship)
- R9 duplicate tarball cleanup (cosmetic)
- Browser CREATE3 / UUPS (FOR-153 scope, CLI-only today)
