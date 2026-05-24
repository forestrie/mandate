# ADR-0001: Coordinator auth strategy seams

**Status:** DRAFT  
**Date:** 2026-05-24  
**Related:** [plan-0001](plans/plan-0001-bootstrap.md),
[canopy issue-delegation handler](https://github.com/forestrie/canopy/blob/main/packages/apps/delegation-coordinator/src/handlers/issue-delegation.ts)

## Context

Mandate calls delegation-coordinator management APIs from browser UX flows. The
coordinator currently accepts a global `COORDINATOR_APP_TOKEN` on UX endpoints; issuance
also accepts per-log `issuerToken`. BYOK operators will eventually prove authority-log
ownership via wallet challenge without a shared app token.

## Decision

Implement **`CoordinatorAuthStrategy`** in Mandate with three modes:

| Mode               | Env        | Implementation                                   | Coordinator dependency           |
| ------------------ | ---------- | ------------------------------------------------ | -------------------------------- |
| `app_token_bff`    | default v1 | Server injects `Bearer ${COORDINATOR_APP_TOKEN}` | None                             |
| `issuer_token`     | v2 stub    | Per-log token from signing route                 | Extend pending/material handlers |
| `wallet_challenge` | v3 stub    | `Authorization: Wallet-Challenge …`              | Curator + trust-root verify      |

Select mode via `COORDINATOR_AUTH_MODE`.

## v1: App token BFF

- Browser calls `/api/coordinator/*` only (same origin).
- Pages Functions read `COORDINATOR_APP_TOKEN` from runtime env (`$env/dynamic/private`).
- Token never appears in client bundle (`pnpm audit:client-secrets` in CI).

## v2: Issuer token (stub)

Coordinator already accepts `issuerToken` on `POST /api/delegations`. UX APIs should
mirror that pattern:

```typescript
checkBearerToken(request, env.COORDINATOR_APP_TOKEN, issuerToken);
```

Mandate `IssuerTokenStrategy` throws `501` until coordinator and session plumbing land.

## v3: Wallet challenge (stub)

Future flow:

1. `POST /api/auth/challenge` returns nonce bound to `authLogId`.
2. Wallet signs challenge; Mandate verifies against Univocity trust root (curator).
3. BFF forwards `Wallet-Challenge` proof to coordinator.

`POST /api/auth/challenge` returns **501** until curator/arbor features ship.

## Signing backends

Separate from coordinator auth:

| Backend           | Status | Notes                                       |
| ----------------- | ------ | ------------------------------------------- |
| `PrivyEoaBackend` | v1     | `secp256k1_sign` for KS256 hash             |
| `SafeBackend`     | stub   | Requires Safe SDK + plan-0029 ERC-1271 path |

## Consequences

- Mandate repo can ship before coordinator auth extensions.
- No coordinator CORS required while BFF mode is default.
- Direct browser → coordinator mode remains possible later via CORS + issuer/challenge auth.
