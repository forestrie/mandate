# Plan 0006 — Mode C onboarding and hands-off sealing (FOR-112, FOR-116, FOR-113)

## Status

Implemented (2026-06-22)

## Objective

Deliver Mode C hosted sealing: Privy I6 policy schema (FOR-116), onboarding with
owner-topology enforcement (FOR-112), and agent-level gated hands-off e2e
(FOR-113).

## Delivered

### FOR-116 — `@mandate/privy-admin` policy

- `packages/libs/privy-admin` with `buildDelegationSigningPolicy()`:
  Privy default-deny + `ALLOW secp256k1_sign` + explicit `DENY` rules for
  transfers/exports/structured signing.
- Documented copy/paste JSON in `docs/service-secrets.md`; linked from
  ADR-0005. ARC-0022 §12 raw-hash residual documented.

### FOR-112 — Mode C onboarding

- `onboardModeCWallet()` — topology checks (I2), policy attach, emits
  `KEY_DIRECTORY` + `OPERATOR_ROOT_KEYS` JSON.
- `mandate-register privy onboard-mode-c` and `task privy:onboard:mode-c`.
- Gated live test: `pnpm --filter @mandate/privy-admin test:live` (requires
  `PRIVY_MODE_C_WALLET_ID`, `PRIVY_MANDATE_SIGNER_ID`,
  `PRIVY_OWNER_AUTHORIZATION_KEY`).

### FOR-113 — Hands-off agent e2e

- `packages/apps/agent/test/hands-off-sealing.live.test.ts` — webhook → agent →
  in-process signer → live Privy → cert verify vs `publicRoot`.
- Structured `delegation.required.outcome` logging in agent.
- CI: extended `.github/workflows/live-owned-wallet.yml` with hands-off and
  onboarding jobs.
- Full live-canopy runbook deferred to FOR-101 in `docs/service-secrets.md`.

## Follow-on

- FOR-100 / FOR-101: full genesis + live coordinator seal.
- Configure `PRIVY_MODE_C_*` secrets in `live-signer` GitHub environment for
  onboarding live job.
