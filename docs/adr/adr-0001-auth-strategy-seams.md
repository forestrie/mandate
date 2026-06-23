# ADR-0001: Coordinator auth strategy seams

**Status:** Accepted
**Date:** 2026-05-24 (updated 2026-06-23)
**Related:**
[devdocs ARC-0023](../../devdocs/arc/arc-0023-wallet-challenge-control-plane-auth.md),
[canopy ADR-0007](https://github.com/forestrie/canopy/blob/main/docs/adr/adr-0007-wallet-challenge-coordinator-auth.md),
[canopy ADR-0008](https://github.com/forestrie/canopy/blob/main/docs/adr/adr-0008-authority-source-route-boundaries.md),
[plan-0001](plans/plan-0001-bootstrap.md)

## Context

Mandate calls delegation-coordinator **user control plane** APIs from browser
UX (`pending`, `enabled`, `signing-route`). The coordinator historically
accepted a global `COORDINATOR_APP_TOKEN` with no binding to `authLogId`.

Platform design ([ARC-0023](../../devdocs/arc/arc-0023-wallet-challenge-control-plane-auth.md),
[canopy ADR-0008](https://github.com/forestrie/canopy/blob/main/docs/adr/adr-0008-authority-source-route-boundaries.md))
partitions routes: user sessions for UX, app token for `/admin/api/` and
service paths, **no bearer** for certificate submit and public reads.

## Decision

Implement **`CoordinatorAuthStrategy`** in Mandate with three modes:

| Mode               | Env default    | Implementation                                   | Coordinator dependency                  |
| ------------------ | -------------- | ------------------------------------------------ | --------------------------------------- |
| `wallet_challenge` | **v1 default** | Forward `Bearer <control-plane-session>`         | `POST /api/auth/challenge` + `/session` |
| `app_token_bff`    | transitional   | Server injects `Bearer ${COORDINATOR_APP_TOKEN}` | None                                    |
| `issuer_token`     | deprecated     | Per-log `issuerToken` for **service** paths only | Issuance/webhook (not UX)               |

Select mode via `COORDINATOR_AUTH_MODE` (default **`wallet_challenge`** in
`wrangler.jsonc`).

Wire contract types live in `@mandate/coordinator-types` (`wcc-1`). Mandate BFF
proxies **`/api/`** paths only via `/api/coordinator/*`; it does **not** expose
`/admin/api/` (operator custody and operator enable gate use server-side app
token outside the browser allowlist).

### BFF allowlist (v1)

Authenticated proxy (session or transitional app token):

- `GET /api/delegations/pending`
- `GET` / `PUT /api/logs/{logId}/enabled`
- `GET` / `POST /api/logs/{logId}/signing-route`

**Public** (no `Authorization` injected):

- `POST /api/delegations/certificate` — self-verifying sealing submit

Challenge/session: dedicated `/api/auth/challenge` and `/api/auth/session`
routes proxy to the coordinator; browser signs
`buildKs256ControlPlaneMessage` (KS256 / EOA).

### Wallet challenge flow

1. Browser `POST /api/auth/challenge` → Mandate proxies → coordinator nonce.
2. Wallet `personal_sign` over the canonical UTF-8 message (EIP-191; Privy
   embedded EOAs use the same wire format as `viem` `signMessage`).
3. Browser `POST /api/auth/session` → coordinator verifies vs **registered
   publicRoot** on the coordinator (not Univocity curator).
4. Browser calls `/api/coordinator/*` with `Authorization: Bearer v1.<session>`.
5. BFF `WalletChallengeStrategy` forwards the same session upstream.

If `personal_sign` is unavailable (e.g. some smart-wallet surfaces), a typed-data
fallback is a future seam; v1 assumes EOAs / Privy embedded wallets.

**Ownership anchor:** registered `publicRoot` at genesis ([ARC-0022 I5](../../devdocs/arc/arc-0022-byok-user-log-delegation-and-operator-hosted-sealing.md)).

### App token BFF (transitional)

When `COORDINATOR_AUTH_MODE=app_token_bff`, the BFF injects
`COORDINATOR_APP_TOKEN` for allowlisted `/api/` paths. Use only while
`ENABLE_WALLET_CHALLENGE` is false on the coordinator. Token never appears in
the client bundle (`pnpm audit:client-secrets` in CI).

### Issuer token (superseded for UX)

`issuerToken` remains for **service** paths on the signing route:
`POST /api/delegations`, webhook CRUD. Do **not** extend issuer token to user
management endpoints. `IssuerTokenStrategy` is retained as a stub for tests.

## Signing backends

Separate from coordinator auth:

| Backend           | Status | Notes                                                                                                                         |
| ----------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `PrivyEoaBackend` | v1     | `secp256k1_sign` for delegation cert hashes                                                                                   |
| Control-plane     | v1     | `personal_sign` on wcc-1 UTF-8 message (EIP-191); verified with `recoverMessageAddress` in coordinator and Mandate unit tests |
| `SafeBackend`     | stub   | Requires Safe SDK + plan-0029 ERC-1271 path                                                                                   |

## Consequences

- Default deployment uses wallet-challenge sessions; no coordinator CORS
  required (BFF same-origin).
- Certificate submit from browser/agent does not need coordinator bearer —
  aligns with public sealing plane.
- Operator pause uses `/admin/api/…/enabled` with server-held app token, not the
  user BFF.
- Genesis **proof-of-possession** / registration bearer is FOR-134
  (`onboard:bind`); `CANOPY_PAYMENTS_ONBOARD_TOKEN` unchanged for ARC-021.
