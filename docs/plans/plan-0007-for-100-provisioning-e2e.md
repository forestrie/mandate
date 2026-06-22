# Plan 0007 — Provisioning and minimal-input e2e (FOR-100, FOR-101)

## Status

Implemented (2026-06-22)

## Objective

Deliver mandate `register` provisioning: consume `CANOPY_PAYMENTS_ONBOARD_TOKEN`

- canopy URLs, call genesis `?webhookUrl=` coordinator forward, emit per-log
  signer descriptors — and prove with a gated live e2e through hands-off sealing.

## Delivered

### FOR-100 — `@mandate/register` provisioning

- `buildGenesisCborBody` — forest genesis v2 int-key CBOR encoder.
- `postGenesis` — Bearer onboard token client; fail closed on coordinator errors.
- `provisionInstance` — Mode C (Privy onboard → genesis) and Mode B descriptor
  emission (user `signerUrl`; full routing deferred FOR-111).
- `mandate-register provision` CLI + `task provision`.
- Unit tests for CBOR body, genesis client, log-id wire, and provision orchestration.

### FOR-101 — Minimal-input live e2e

- `packages/apps/register/test/provision-e2e.live.test.ts` — gated live test:
  onboard token + canopy URLs → `provisionInstance` → in-process hands-off seal.
- CI job `live-provision` in `.github/workflows/live-owned-wallet.yml`.
- Provisioning runbook in `docs/service-secrets.md`.

## Dependencies (all Done before this slice)

- FOR-89/90 — canopy genesis auth + payment graph.
- FOR-122 — genesis `?webhookUrl=` coordinator forward.
- FOR-112/113 — Mode C onboard + hands-off agent path.

## Follow-ups

- FOR-111 — Mode B user remote signer routing + fork story.
- Deployed-stack acceptance: canopy `byok-mode-c-webhook-seal.spec.ts`.
- FOR-121 — close Linear issue (I2 topology code landed in FOR-112).
