# plan-0005 — FOR-104 delegation signer backend spike

**Status:** DRAFT  
**Date:** 2026-06-22  
**Related:** [FOR-104](https://linear.app/forestrie/issue/FOR-104),
[ADR-0002](./adr/adr-0002-delegation-signer-custody.md),
[ADR-0003](./adr/adr-0003-delegation-signer-backend.md),
[plan-0004](./plan-0004-for-98-agent.md)

## Goal

Compare **Privy server wallets** vs **GCP Cloud KMS (mandate-dedicated project)** as
the production KS256 remote signer for `@mandate/agent`, and produce a decision
with a finalized remote-signer HTTP contract.

## Method

1. Shared harness (`verifyBackend` gate) in
   [`spikes/for-104-delegation-signer/`](../../spikes/for-104-delegation-signer/).
2. Mock PoCs (offline) proving assemble + verify for both backends.
3. Live flip documented for operator-run validation (`SPIKE_LIVE=1`).
4. GCP bootstrap checklist scored against forest-1 independence.
5. Decision matrix → ADR-0003.

## PoC results (mock, 2026-06-22)

| Backend | Mode | verifyBackend | Latency (mock) |
| ------- | ---- | ------------- | -------------- |
| local-secp (control) | mock | PASS | ~8 ms |
| Privy | mock | PASS | ~3 ms |
| GCP KMS | mock | PASS | ~7 ms |

All pass `buildDelegationCertificateKs256WithSigner` +
`verifyDelegationCertificateKs256` against a random test root.

**Live validation:** pending operator run with `SPIKE_LIVE=1` (see spike
README).

## Resolved spike questions

| Question | Privy | GCP KMS |
| -------- | ----- | ------- |
| Hash input | `keccak256(sigStructure)` via `secp256k1_sign` | Same digest in `digest.sha256` |
| Output shape | 65-byte recoverable (`v` 27/28) | DER → recoverable + `v` recovery |
| Address match | Wallet address = `rootSignerAddress` | KMS pubkey → Ethereum address |
| Authorization | `privy-authorization-signature` when wallet has owner | OAuth bearer / thin service |
| Worker direct? | **Yes** (`fetch` to api.privy.io) | **No** (needs thin signer or token broker) |

## Decision matrix

| Criterion | Weight | Privy | GCP KMS |
| --------- | ------ | ----- | ------- |
| **Setup effort (mandate-specific GCP vs Privy)** | **Primary** | Lower (~0.5–1 d) | Higher (~1–2 d + thin signer) |
| Fork-friendliness | High | Good (Privy app per operator) | Heavy (GCP project + HSM + service) |
| Custody / compliance | High | MPC/TEE (vendor) | HSM FIPS-friendly |
| Worker compatibility | High | Direct | Thin Cloud Run signer |
| Latency (expected live) | Medium | ~100–400 ms | ~70–200 ms (+ service hop) |
| Low-volume cost | Medium | SaaS wallet pricing | ~$1–3/mo HSM + per-op |
| Implementation complexity | Medium | Low (hex parse) | Medium (DER + `v`) |

## Recommendation

**Provisional: Privy server wallet (`secp256k1_sign`) for v1 production**, unless
live GCP bootstrap proves acceptable for compliance requirements.

Rationale:

- Primary criterion favours Privy (no mandate-dedicated GCP project required for
  pilot).
- `@mandate/ui` already uses Privy; operators understand the model.
- Worker can call Privy directly without a thin signer service.
- GCP KMS remains the path when HSM/FIPS is mandatory — see
  [`gcp-bootstrap-checklist.md`](../../spikes/for-104-delegation-signer/gcp-bootstrap-checklist.md).

**Confirm after:** operator runs live spike for chosen backend; update
ADR-0003 status to ACCEPTED.

## Follow-up work (out of spike scope)

1. Implement production Privy adapter + optional thin signer for GCP (new issue).
2. Extend remote-signer contract per ADR-0003 (`logId`, `keyRef`, auth).
3. FOR-100: provisioning writes per-log `signerUrl` + `rootSignerAddress`.
4. Optional: agent-side `verifyDelegationCertificateKs256` before material
   submit (defense in depth).

## Artifacts

- Spike code: `spikes/for-104-delegation-signer/`
- GCP checklist: `spikes/for-104-delegation-signer/gcp-bootstrap-checklist.md`
- Worker notes: `spikes/for-104-delegation-signer/worker-compat-latency.md`
