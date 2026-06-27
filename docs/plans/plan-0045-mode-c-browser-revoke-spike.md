# Plan 0045 — Mode C browser custody revoke spike (FOR-197)

**Status:** COMPLETE (spike negative)  
**Date:** 2026-06-27  
**Issue:** [FOR-197](https://linear.app/forestrie/issue/FOR-197)

## Question

Can the Privy **browser SDK** (`@privy-io/js-sdk-core`) let a wallet **owner** (user
session) remove mandate as an **additional signer** without the owner P-256
authorization key?

## Findings

| Surface | Capability | Custody revoke? |
|---------|------------|-----------------|
| `@privy-io/js-sdk-core` embedded wallet | `personal_sign`, `secp256k1_sign` via provider | No wallet-admin APIs |
| `@mandate/privy-admin` `revokeModeCWallet` | Server `PATCH /v1/wallets/{id}` with `additional_signers: []` | Requires **owner authorization key** (P-256) via `privy-authorization-signature` |
| Mandate UI BFF | No Privy admin routes; must not hold owner key (ARC-0022 I3) | N/A |

**Conclusion:** In-browser custody revoke is **not viable** without either (a)
exposing the owner authorization key to the browser (violates I3) or (b) a new
mandate BFF that holds/relays the key (same violation).

## Decision

Ship **coordinator-layer kill switch in UI** (`setLogDelegationEnabled` via
wallet-challenge `logs:enabled:write`) as the in-browser control. Document
**custody revoke** as operator-assisted CLI (`task privy:revoke:mode-c`) with
runbook deep-link. No misleading "Revoke in browser" button.

## Acceptance

- Spike outcome recorded (this doc + `mode-c-revoke-spike.ts`)
- Kill-switch UX separates coordinator pause vs custody revoke
- FOR-117 CLI path linked; I3 respected
