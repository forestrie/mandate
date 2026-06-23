# Wallet-challenge follow-ups

**Status:** Tracking  
**Related:** [ARC-0023](../../../devdocs/arc/arc-0023-wallet-challenge-control-plane-auth.md),
[canopy ADR-0007](https://github.com/forestrie/canopy/blob/main/docs/adr/adr-0007-wallet-challenge-coordinator-auth.md)

## ES256 envelope path

- COSE_Sign1 over canonical CBOR envelope (`wcc-1` fields).
- Coordinator `POST /api/auth/session` `alg: ES256` branch.
- Mandate `personal_sign` equivalent for P-256 embedded wallets (if supported).

## Hierarchical authority logs (ARC-0017)

- Today: `session.authLogId` must equal request `authLogId` / target `logId`.
- Extension: resolve ancestry or grant graph so parent authority logs may manage
  child logs with scoped sessions.

## Operator-key challenge (service boundary spike)

- Optional unified primitive for mandate-operator → canopy registration trust.
- Evaluate replacing long-lived `CANOPY_PAYMENTS_ONBOARD_TOKEN` / shrinking
  `COORDINATOR_APP_TOKEN` surface with operator-key challenge + short-lived
  service sessions.
- Outcome: spike doc or ADR stub only; no v1 dependency.
