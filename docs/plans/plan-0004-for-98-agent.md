# plan-0004 — FOR-98 mandate-agent

Implements [FOR-98](https://linear.app/forestrie/issue/FOR-98): webhook receiver

- non-custodial signer on `@canopy/delegation-cose`.

## Scope delivered

- **Canopy:** `GET /.well-known/forestrie-webhook-jwks.json` (JWKS with `kid`).
- **Mandate `@mandate/coordinator-types`:** sync script targets shared lib; ui
  migrated off local copy.
- **Mandate `@mandate/agent`:** Cloudflare Worker with
  `POST /webhooks/delegation-required`, `GET /health`.
- **Signer model:** `DelegationSigner` interface; `LocalKs256Signer` (dev/test);
  `RemoteKs256Signer` (production path); multi-log `OPERATOR_ROOT_KEYS` map.
- **Tests:** component-level vitest (mocked coordinator submit + JWKS verify).

## Out of scope (other issues)

| Issue   | Responsibility                          |
| ------- | --------------------------------------- |
| FOR-99  | Fork-friendly agent deploy workflow     |
| FOR-100 | Provisioning writes per-log descriptors |
| FOR-101 | Live local e2e (onboard token only)     |

## Follow-ups

- [FOR-104](https://linear.app/forestrie/issue/FOR-104) — Delegation signer backend: Privy vs GCP KMS
- [FOR-105](https://linear.app/forestrie/issue/FOR-105) — ES256 signer + algorithm-by-root
- [FOR-106](https://linear.app/forestrie/issue/FOR-106) — Publish `@canopy/delegation-cose` to npm

See [ADR-0002](../adr/adr-0002-delegation-signer-custody.md) and
[CONTEXT.md](../../CONTEXT.md).
