# Plan 0047 — UI browser e2e (Playwright)

**Status:** Complete (Phase 1)
**Date:** 2026-06-28
**Audience:** Mandate UI engineers and agents working on `@mandate/ui`.
**Scope:** Phase 1 — a mandate-owned, browser-based Playwright e2e package for
`@mandate/ui` that runs hermetically (no deployed system) and is structured so an
agent can preview and assess results. Cross-repo / deployed system-wide testing
is **out of scope** here and is described in
[devdocs arc-0024](https://github.com/forestrie/devdocs/blob/main/arc/arc-0024-system-testing-architecture.md).

> **Linear:** project
> [Onboard & registration system tests](https://linear.app/forestrie/project/onboard-and-registration-system-tests-4bace4dcc65c).
> Phase 1 issues: FOR-220 (Privy seam), FOR-221 (scaffold), FOR-222 (mocks),
> FOR-223 (specs), FOR-224 (CI). Phase 2 (arc-0024): FOR-225, FOR-226, FOR-227.
> Branch per issue per [branch-naming.mdc](../.cursor/rules/branch-naming.mdc).

## Context

`@mandate/ui` is a SvelteKit 2 / Svelte 5 SPA deployed to Cloudflare Pages. It is
the **delegation console**: Privy email login, embedded-wallet signing, listing
and signing pending delegation certificates, wallet-challenge coordinator auth,
and the Mode C kill switch. Today the only automated tests are Vitest unit/spec
tests (`vite.config.ts` `server` project). There is **no Playwright** anywhere in
the repo.

Two facts shape this plan:

1. **There is no browser "register a new univocity instance" flow.** Instance
   registration/onboarding is CLI-only (`@mandate/register`, `@mandate/privy-admin`)
   by design — see
   [plan-0003](plan-0003-for-97-package-split.md) (UI vs register split) and
   [plan-0045 mode-c-browser-revoke-spike](plan-0045-mode-c-browser-revoke-spike.md)
   (browser-side Privy custody ops are not viable). The browser Privy flow that
   _does_ exist and is worth automating is the **delegation console login +
   signing** path. A true end-to-end "register an instance" test is inherently
   cross-repo and belongs in the system-testing layer (arc-0024), not here.
2. The platform mandates **Playwright Test** for e2e
   ([devdocs adr-0003](https://github.com/forestrie/devdocs/blob/main/adr/adr-0003-e2e-testing-approach.md)).
   [Canopy `@canopy/api-e2e`](https://github.com/forestrie/canopy/tree/main/packages/tests/canopy-api)
   is the reference, but it is **API-mode only**; this is the platform's first
   **browser** Playwright suite, so it sets browser conventions
   (trace/screenshot/video) the API reference lacks.

## Goals

- A workspace package `@mandate/ui-e2e` at `packages/tests/ui-e2e` running
  `@playwright/test` against the UI.
- A **hermetic `ui` tier**: Playwright starts the UI locally and mocks the
  coordinator BFF and Privy, so it needs **no deployed system** and runs on every
  PR.
- **Agent-previewable results**: HTML + JSON reports, traces, screenshots, and
  video at documented stable paths, with a README describing how an agent reads
  them.
- A **Privy login seam** that removes the `window.prompt` blocker and allows a
  deterministic test login, leaving the real login path unchanged when the seam
  is off.
- Fixtures/mocks/utils structured for later **extraction into a reusable testing
  package** the system-testing repo can consume (arc-0024) — keep them
  side-effect-free and import-clean.

## Non-goals

- No browser registration/onboarding UI (does not exist; would be net-new product
  work). **Superseded** by devdocs plan-2607-45 slice 04 (Safe 1x1 Mode D):
  the `/onboard` wizard now IS the browser registration flow.
- No deployed, cross-repo, or on-chain system tests in Phase 1 (→ arc-0024).
- No changes to the coordinator, canopy, or on-chain contracts.
- No Vitest browser-mode component tests (different tool; this is flow e2e).

## Behaviours to test (TDD planning gate)

Listed as behaviours through the UI's public surface (pages + same-origin BFF),
not implementation steps. Prioritised; build as vertical slices (one behaviour →
minimal harness → next).

1. **Tracer bullet.** Home page loads; entering an `authLogId` navigates to
   `/delegations?authLogId=<id>` (`src/routes/+page.svelte`).
2. **Unauthenticated console.** `/delegations` shows a connect/login affordance
   and no pending list when Privy is not authenticated.
3. **Login → authenticated.** Email login via the test seam yields an
   authenticated session with an embedded-wallet address rendered.
4. **Pending list renders.** With the BFF mocked, `GET delegations/pending`
   results render as rows; empty response shows an empty state.
5. **Sign → submit success.** Signing a pending delegation calls
   `POST delegations/certificate` and the row reflects success.
6. **Error surfacing.** A BFF error (e.g. 403 with CBOR problem-details) produces
   a visible, non-crashing error state.
7. **Kill switch.** Toggling per-log delegation calls `PUT logs/{logId}/enabled`
   and reflects the new state (`GET logs/{logId}/enabled`).
8. **(Integration tier, deferred)** Wallet-challenge session: challenge →
   `personal_sign` → `/api/auth/session` established before scoped calls
   (`COORDINATOR_AUTH_MODE=wallet_challenge`). Hardest path; build after 1–7.

BFF route shapes to mock come from
`src/lib/coordinator/bff-allowlist.ts` (`delegations/pending`,
`delegations/certificate`, `logs/{logId}/enabled`, `logs/{logId}/signing-route`)
and `/api/auth/challenge`, `/api/auth/session`.

## Prerequisite: Privy login seam (small production change)

`src/lib/privy/stores.svelte.ts` `loginWithEmail()` currently reads the OTP via
`window.prompt(...)` (line ~52). `window.prompt` cannot be driven headlessly.
Two coupled changes:

- **Replace `window.prompt` with an in-DOM OTP input** in the login UI. This is a
  UX improvement (no native dialog) and makes the field Playwright-fillable with
  no test-only branch.
- **Add a Privy client seam** so a build/runtime flag selects a deterministic
  test double for the hermetic tier:
  - `PUBLIC_E2E_PRIVY=mock` → a fake client in `lib/privy/` provides a fixed
    embedded-wallet address and deterministic `secp256k1`/`personal_sign`
    responses; no network to Privy.
  - flag unset → unchanged real `@privy-io/js-sdk-core` path.

  Alternatively (integration tier) use a **Privy test account** with a static OTP
  against the real SDK; confirm availability (open question O1).

Keep the seam minimal and behind the existing `getPrivyClient()` boundary in
`lib/privy/client.ts` so production code paths are untouched when the flag is off.

## Package structure

```text
packages/tests/ui-e2e/
  package.json            # @mandate/ui-e2e; scripts are plain `playwright test`
  playwright.config.ts    # projects: ui (webServer + mocks), integration
  tsconfig.json
  global-setup.ts         # run-id label; nothing deployed
  fixtures/
    app.ts                # page fixture: starts at UI, applies mocks
    privy-login.ts        # deterministic login helper (mock or test account)
  mocks/
    coordinator-bff.ts    # page.route() handlers for /api/coordinator/* + auth
    privy.ts              # SDK/network doubles for hermetic tier
  tests/
    ui/                   # hermetic behaviours 1–7
    integration/          # behaviour 8 + deployed smoke (opt-in)
  README.md               # how to run; where reports/traces are; agent guide
```

Scripts (mirror canopy — **no `doppler run` in package.json**):

```json
{
	"scripts": {
		"test:e2e": "playwright test --project=ui",
		"test:e2e:ui": "playwright test --project=ui",
		"test:e2e:integration": "playwright test --project=integration",
		"report": "playwright show-report"
	}
}
```

Pin `@playwright/test` to canopy's line (`^1.48.0` or newer-consistent) to ease
later shared infra.

## Playwright config

- **`ui` project (hermetic, default):** `webServer` runs the UI locally. Prefer
  `wrangler pages dev .svelte-kit/cloudflare --port 4173` (matches the deployed
  Pages Functions BFF) after `pnpm --filter @mandate/ui build`; `vite dev`
  (5173) is the faster-iteration fallback. `baseURL` points at the local server.
  BFF + Privy are mocked, so no upstream is required. `PUBLIC_E2E_PRIVY=mock` and
  placeholder `PUBLIC_MANDATE_PRIVY_*` are set for the server.
- **`integration` project (opt-in):** no `webServer`; `baseURL` from
  `MANDATE_BASE_URL` (e.g. `https://mandate-dev.forestrie.dev`); real Privy test
  account; real `coordinator-a.forest-2.forestrie.dev`. Run on demand / nightly.
- **No `webServer` for `integration`** — matches canopy's deployed-target model.

## Agent-previewable results

The API reference (canopy) configures no trace/video/screenshot. For a browser
suite these are the primary way an agent assesses outcomes, so enable them:

- `reporter: [["html", { open: "never" }], ["json", { outputFile: "test-results/results.json" }], ["list"]]`
  — HTML always (not just CI) plus machine-readable JSON.
- `use: { trace: "on-first-retry", screenshot: "only-on-failure", video: "retain-on-failure" }`.
- Stable paths documented in the README: `playwright-report/index.html`,
  `test-results/results.json`, per-test `test-results/<spec>/` (trace.zip,
  screenshots, video).
- Optional `testInfo.attach()` for structured evidence (e.g. decoded CBOR
  problem-details), mirroring canopy's attachment pattern.

README "agent guide" section: an agent runs `test:e2e:ui`, reads
`test-results/results.json` for pass/fail, opens failure screenshots inline, and
uses `trace.zip` for step-level detail.

## CI

- New `.github/workflows/ui-e2e.yml` (or extend `test.yml`): on PR/push, install,
  `playwright install chromium`, build UI, run `--project=ui --forbid-only`,
  upload `playwright-report/` and `test-results/` artifacts (always; on failure
  retain).
- `integration` tier: `workflow_dispatch` / scheduled, GitHub Environment for
  secrets, Doppler `mandate-forestrie` outside npm (per
  [e2e-local-doppler conventions](https://github.com/forestrie/canopy/blob/main/.cursor/rules/e2e-local-doppler.mdc)).
  Never commit a repo-root `.env`.

## Reusable-kit shaping (toward arc-0024)

Keep `fixtures/`, `mocks/`, and any coordinator/Privy helpers free of
test-runner globals at module load and free of mandate-app internals beyond typed
contracts (`@mandate/coordinator-types`). This lets them later move into a
publishable `@mandate/ui-e2e-kit` consumed by the system-testing repo without
rework. Do **not** publish in Phase 1 — note the cross-repo registry blocker
recorded in [plan-0046](plan-0046-package-f-review-remediation.md) F1
(405/403 → git pin) as a reason to defer publishing until arc-0024 designs it.

## Acceptance criteria

- `pnpm --filter @mandate/ui-e2e test:e2e:ui` runs headless, requires **no
  deployed system**, and passes.
- OTP entry no longer uses `window.prompt`; an in-DOM input exists and is
  Playwright-fillable.
- Privy mock seam is selected by `PUBLIC_E2E_PRIVY=mock`; with it unset, the real
  Privy path is byte-for-byte unchanged (verified by existing unit tests still
  passing and no diff in production bundle behaviour).
- Behaviours 1–7 are covered by passing specs in `tests/ui/`.
- HTML + JSON reports and trace/screenshot/video are produced at the documented
  paths; README documents the agent preview flow.
- A CI job runs the `ui` tier on PRs and uploads report + results artifacts.
- `pnpm -r test` and `pnpm check` remain green; no production runtime regression.

## Open questions

- **O1 — Privy test accounts:** does the mandate Privy app support test accounts
  with static OTP for the `integration` tier? If not, the hermetic mock is the
  only deterministic path and `integration` uses a fully mocked Privy too.
- **O2 — webServer target:** `wrangler pages dev` (BFF-accurate) vs `vite dev`
  (faster). Default to `wrangler pages dev`; allow `vite dev` via env for local
  iteration.
- **O3 — Publish vs in-repo kit:** keep the kit in-repo for Phase 1; arc-0024
  decides the publishing mechanism and timing.

## Related

- [devdocs arc-0024 — system-testing architecture](https://github.com/forestrie/devdocs/blob/main/arc/arc-0024-system-testing-architecture.md)
- [devdocs adr-0003 — e2e testing approach (Playwright)](https://github.com/forestrie/devdocs/blob/main/adr/adr-0003-e2e-testing-approach.md)
- [canopy `@canopy/api-e2e`](https://github.com/forestrie/canopy/tree/main/packages/tests/canopy-api) — API-mode reference
- [canopy plan-0044 — Package D cross-stack e2e (FOR-201)](https://github.com/forestrie/canopy/blob/main/docs/plans/plan-0044-package-d-cross-stack-e2e.md)
- [plan-0044 — delegation console (Package C)](plan-0044-package-c-delegation-console.md)
- [plan-0045 — Mode C browser revoke spike](plan-0045-mode-c-browser-revoke-spike.md)
- [devdocs arc-0022 — BYOK delegation & operator-hosted sealing](https://github.com/forestrie/devdocs/blob/main/arc/arc-0022-byok-user-log-delegation-and-operator-hosted-sealing.md)
- [devdocs arc-0023 — wallet-challenge control-plane auth](https://github.com/forestrie/devdocs/blob/main/arc/arc-0023-wallet-challenge-control-plane-auth.md)
