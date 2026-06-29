# @mandate/ui-e2e

Hermetic Playwright browser e2e for the Mandate delegation console (`@mandate/ui`).
No deployed coordinator, Privy network, or Doppler required.

Spec: [plan-0047](../../../docs/plans/plan-0047-ui-browser-e2e.md).

## Run locally

From the mandate repo root:

```bash
pnpm install
pnpm exec playwright install chromium   # once
pnpm test:e2e:ui   # builds @forestrie/mandate-ui-e2e-kit then runs Playwright
```

Reusable fixtures live in `@forestrie/mandate-ui-e2e-kit` (see
[packages/tests/ui-e2e-kit/README.md](../ui-e2e-kit/README.md)).

Or: `task test:e2e:ui` (after Taskfile install).

## Agent preview (pass/fail + failures)

| Artifact                     | Path                                                 |
| ---------------------------- | ---------------------------------------------------- |
| HTML report                  | `packages/tests/ui-e2e/playwright-report/index.html` |
| JSON results                 | `packages/tests/ui-e2e/test-results/results.json`    |
| Traces / screenshots / video | `packages/tests/ui-e2e/test-results/<spec>/`         |

```bash
pnpm --filter @mandate/ui-e2e report
```

On failure: read `results.json` for status, open HTML report or `trace.zip` in the trace viewer.

## Projects

| Project        | Purpose                                                   |
| -------------- | --------------------------------------------------------- |
| `ui` (default) | Hermetic — local `wrangler pages dev`, mocked BFF + Privy |
| `integration`  | Reserved (no specs in Phase 1)                            |

Scripts are plain `playwright test` — no `doppler run` in package.json.
