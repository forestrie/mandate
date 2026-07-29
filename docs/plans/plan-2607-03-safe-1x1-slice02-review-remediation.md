# plan-2607-03 — Safe 1x1 slice 02 review remediation

**Status:** DRAFT
**Date:** 2026-07-29
**Related:** devdocs plan-2607-45 slice 02, FOR-501, mandate#79 (branch
`mandate-1`), review via forestrie-agents `review-changes`.

## Scope reviewed

`git diff main...HEAD` on `mandate-1` (commit `5a86bb9`): callback onboard
attestation producer + subpath export, CLI attestation wiring, Safe 1x1
(Mode D) provisioning (interactive descriptor, `KeyRegistry` refusal,
metadata `describe()`), ADR-0005 addendum + CONTEXT.md glossary riders.

## Findings

| ID | Sev | Dim | Location | Finding |
|----|-----|-----|----------|---------|
| M1 | Medium | Liveness / correctness | `agent/src/handle-delegation-required.ts:116` | Only `UnknownLogSignerError` is mapped; the new `InteractiveRootSignerError` escapes the handler as an unhandled throw (5xx). Mode D genesis **does** register the agent webhook (provision `base.agentWebhookUrl` → genesis `webhookUrl=`), and the coordinator's `enqueueWebhookDelivery` consults only the webhook config — **not** `signing_routes.mode` — so every delegation demand on a Mode D log webhooks the agent, 500s, and burns the full retry ladder into dead-letter noise. The pending row still exists for the console wallet path, so this is noise + wasted deliveries, not lost demand. |
| M2 | Low | Best practice / test coverage | `register/src/cli.ts` (`buildOnboardRequestAttestation`) | Attestation arms only on flags; `MANDATE_SIGNER_URL` set in env with no flags silently posts **unattested** (caught downstream by canopy 400 where the flag is armed, but the CLI's own fail-loudly goal misses env-only configs). The partial-flag loud-failure path has no CLI test (`exit-to-mode-b.cli.test.ts` is the pattern). |
| M3 | Low | Best practice | `register/src/cli.ts` (`runProvision`) | `--mode` typo coerces silently to `'C'` (pre-existing shape, but a three-mode surface makes a loud "unknown mode" error worth it; today a typo fails later on missing Privy config, which is survivable but misleading). |

## Design notes (non-obvious, upheld)

- The interactive descriptor discipline is enforced twice: `KeyRegistry.get`
  refuses at the signing path (`InteractiveRootSignerError`) and `load` fails
  fast on a misassembled `interactive`+`signerUrl` descriptor — both
  test-pinned via the Mode D provisioning test.
- Ops introspection correctly moved to the metadata-only `describe()` so
  Mode D descriptors stay observable without opening a signing path; the
  allowlist response shape is unchanged.
- Coordinator compatibility was verified read-only: the pending queue is
  signing-route `mode: "wallet"`; the console wallet session sets it
  (slices 03/04). Nothing in slice 02 needed a coordinator change — but see
  M1 for the dispatch gap that slice 03/04 must close.

## Remediation items

### R1 (from M1) — non-retryable mapping for interactive roots

- `handle-delegation-required`: catch `InteractiveRootSignerError`, log a
  `delegation outcome 'interactive_root'`, clear the seen-store reservation,
  and return a **non-retryable** response (409 or 404 with a stable error
  body) so the coordinator ladder stops immediately.
- Acceptance: unit test drives the webhook handler with an interactive
  descriptor and asserts status + outcome log + reservation clear; no 5xx.
- Branch: current stack (mandate#79 follow-up commit or immediate successor).

### R2 (sibling repo, canopy — cannot ship on this stack)

- `enqueueWebhookDelivery` (delegation-store DO) should suppress signer
  webhooks for logs whose signing route is `mode: "wallet"` (route-aware
  dispatch), and/or Mode D onboarding should skip agent-webhook registration.
  Belongs with slice 03/04 when the console sets the wallet route at onboard.
- Tracked in Linear (see review comments on FOR-501/FOR-502).

### Deferred (Low)

- M2: arm attestation from `MANDATE_SIGNER_URL` env alone (still requiring
  `--root-address`/`--log-id`, erroring loudly when absent); add the CLI test
  for the partial-flag path.
- M3: reject unknown `--mode` values loudly.
