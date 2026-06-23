# Plan 0008 — Mode C kill switch and documented exits (FOR-114, FOR-117)

## Status

Implemented (2026-06-22)

## Objective

Deliver the Mode C custody-layer kill switch (ARC-0022 I2→I3): programmatic
Privy revoke via CLI, live verification that mandate signing is denied
post-revoke, and documented exit gradient in ADR-0005.

## Delivered

### FOR-117 — Programmatic revoke (CLI-first)

- `revokeModeCWallet()` in `@mandate/privy-admin` — owner-signed PATCH
  `additional_signers: []` with post-revoke topology assertion.
- `mandate-register privy revoke-mode-c` and `task privy:revoke:mode-c`.
- Unit tests: `packages/libs/privy-admin/test/revoke-mode-c.test.ts`.

### FOR-114 — Live verification + runbook

- Live test in `mode-c.live.test.ts`: revoke → deny `secp256k1_sign` →
  re-onboard to restore shared `E2E_MODE_C_USER_PRIVY_WALLET_ID`.
- Operational appendix in [ADR-0005](../adr/adr-0005-byok-delegation-modes.md):
  exit gradient, in-flight semantics, propagation timing.

### FOR-128 (partial)

- CI workflow ordering: `live-mode-c-onboard` runs after `live-provision` so
  revoke test does not race provision e2e.
- Doppler ↔ GitHub sync for `live-signer` documented in `docs/service-secrets.md`.

## Deferred

- **UI programmatic revoke** — server BFF calling `revokeModeCWallet` with owner
  key (FOR-117 UI half). UI today links to runbook + CLI.
- **Delegation outcome/history** in pending queue (FOR-115 audit surface).

## Validation

```sh
pnpm --filter @mandate/privy-admin test
doppler run --project mandate-forestrie --config dev -- task privy:revoke:mode-c
doppler run --project mandate-forestrie --config dev -- \
  pnpm --filter @mandate/privy-admin test:live
```

## Follow-on

- Doppler ↔ GitHub sync for `live-signer` (operational `dev` + `e2e` configs).
- UI BFF revoke button when owner auth can be obtained from user session.
