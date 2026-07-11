# @forestrie/mandate-ui-e2e-kit

Reusable Playwright fixtures and coordinator BFF mocks for mandate UI browser
e2e. Published for cross-repo consumers per
[devdocs ARC-0024](https://github.com/forestrie/devdocs/blob/main/arc/arc-0024-system-testing-architecture.md)
and [ADR-0041](https://github.com/forestrie/devdocs/blob/main/adr/adr-0041-e2e-kit-publishing.md).

## Install

Published to **public npmjs** with SLSA provenance (FOR-361) — tokenless
install, no `.npmrc` scope mapping. The `@forestrie` scope maps to one
registry per consumer, and consumers such as `forestrie/system-testing`
install this kit alongside npmjs-only `@forestrie/canopy-e2e-kit`, so the kit
publishes to npmjs too.

```bash
pnpm add @forestrie/mandate-ui-e2e-kit @playwright/test

# Peer: coordinator types from mandate at a pinned commit
pnpm add "github:forestrie/mandate#<sha>&path:packages/libs/coordinator-types"
```

## Public API

- `installCoordinatorMocks(page, options?)` — browser route mocks for BFF + auth
- `loginWithMockPrivy`, `loadPending` — Privy OTP login helpers
- `samplePendingEntry`, `samplePendingEntries`, `E2E_AUTH_LOG_ID`, …
- `test`, `expect` — Playwright fixture with `consolePage` + `mocks` option

## Build

```bash
pnpm --filter @forestrie/mandate-ui-e2e-kit build
pnpm --filter @forestrie/mandate-ui-e2e-kit test
```

Hermetic runner `@mandate/ui-e2e` depends on this package via `workspace:*`.
