# Plan: Genesis proof-of-possession (onboard:bind)

**Status:** Follow-up (post wallet-challenge v1 management auth)  
**Related:** [ARC-0023](../../../devdocs/arc/arc-0023-wallet-challenge-control-plane-auth.md),
[ARC-021](../../../devdocs/arc/arc-0021-registration-control-plane.md),
[canopy forward-coordinator-registration](https://github.com/forestrie/canopy/blob/main/packages/apps/canopy-api/src/forest/forward-coordinator-registration.ts)

## Problem

Wallet-challenge **management** auth verifies ownership against an **existing**
registered `publicRoot`. At genesis, the candidate root `K(L)` is not yet on the
coordinator — the user must prove **proof-of-possession** before registration
commits.

## Scope (future)

| Component                              | Change                                                                                             |
| -------------------------------------- | -------------------------------------------------------------------------------------------------- |
| canopy-api genesis broker              | Accept signed wcc-1 envelope with `onboard:bind` scope over candidate key material in genesis body |
| mandate `mandate-register` / provision | Sign PoP envelope with user wallet before calling genesis                                          |
| coordinator                            | No session required — PoP verified at canopy-api boundary                                          |

## Non-goals

- Replacing `CANOPY_PAYMENTS_ONBOARD_TOKEN` for mandate-operator → canopy trust
- Univocity curator lookup for PoP (candidate key is the anchor)

## Acceptance

- User genesis with BYOK wallet: coordinator receives `publicRoot` only after
  canopy-api validates PoP signature on the submitted candidate `K(L)`.
- Operator-provisioned genesis unchanged (operator onboard token).
