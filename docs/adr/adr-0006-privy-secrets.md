# ADR-0006: Operational vs E2E secret naming (MANDATE* / E2E*)

**Status:** Accepted (2026-06-23)

**Related:** [service-secrets.md](../service-secrets.md), [ADR-0005](adr-0005-byok-delegation-modes.md),
[ADR-0003](adr-0003-delegation-signer-backend.md), [CONTEXT.md](../../CONTEXT.md)

## Context

Mandate stores Privy credentials, synthetic test wallets, and dev Canopy/coordinator
URLs in Doppler (`mandate-forestrie`). The same names must appear in GitHub
Environments, Cloudflare Worker bindings, live tests, CLI, and docs. Historically
`PRIVY_*` and `CANOPY_*` names mixed **operational instance secrets** with **E2E
fixture secrets**, making it unclear which values belong in production Workers vs
CI-only environments.

## Decision

1. **Operational secrets** use the `MANDATE_` prefix (and `PUBLIC_MANDATE_PRIVY_*`
   for UI public vars). Long-lived mandate-instance credentials: Privy app,
   mandate additional-signer authorization key, key quorum id. Doppler configs
   `dev` and `prod`; GitHub `prod` (and operational subset on `live-signer` for CI).

2. **E2E fixture secrets** use the `E2E_` prefix. Synthetic Mode C test user
   wallet + owner auth key, signer test wallet, dev Canopy/coordinator URLs.
   Doppler config **`e2e` only**; GitHub **`live-signer` only** — never `prod`.

3. **Full-stack rename.** The same env var / Wrangler binding name is used
   everywhere. Worker `Env` fields, wrangler secrets, tests, and workflows use
   `MANDATE_PRIVY_APP_ID` (not a separate `PRIVY_APP_ID` alias).

4. **Hard cutover.** No `readEnv(new, old)` helpers and no workflow fallbacks to
   legacy names. Missing new names fail visibly (test skip, CLI usage, CI
   preflight, `scripts/check-legacy-secret-names.mjs`).

5. **`MANDATE_PRIVY_AUTHORIZATION_KEY`** is mandate's additional-signer P-256 key
   (`wallet-auth:` + base64 PKCS#8 DER). Required when `@mandate/signer` calls
   Privy `secp256k1_sign` on user-owned wallets (ADR-0003 S3 authorization
   signature). Operational — not per-user.

## Rejected

- Alias/mapping layer between Doppler canonical names and Worker `PRIVY_*` bindings
- Legacy env fallbacks during migration
- Storing real user owner keys in Doppler/GitHub (only `E2E_MODE_C_PRIVY_OWNER_AUTH_KEY`
  for the synthetic test user)

## Consequences

- Doppler operators must create config `e2e`, rename secrets, and re-sync GitHub
  before live CI passes (see service-secrets rollout checklist).
- Real Mode C users onboard with their own wallets via UI/session (FOR-117); their
  credentials never appear in `E2E_*` or `MANDATE_*` Doppler keys except the
  shared mandate authorization key.

## Rename reference

See [service-secrets.md](../service-secrets.md) for the full old → new map and
Worker catalog.
