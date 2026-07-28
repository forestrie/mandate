---
id: 2607-02
status: draft
created: 2026-07-28
refs: [ADR-0059, FOR-485, FOR-497]
---

# Plan 2607-02 — fee surface review remediation

**Status:** DRAFT · **Created:** 2026-07-28

**Related:** devdocs ADR-0059 (D3 credits, D8 bootstrap-key attestation),
canopy plan-2607-07 (account-read remediations, R2 tri-state),
[FOR-485](https://linear.app/forestrie/issue/FOR-485),
PRs [mandate#75](https://github.com/forestrie/mandate/pull/75),
[canopy#197](https://github.com/forestrie/canopy/pull/197).

## Context

`/review-changes` findings for the console fee surface (mandate#75, single
branch `mandate-1` vs `main`, commit `7a95395`; sibling canopy#197). Reviewed
under the distributed-systems / applied-crypto lens, implementation focus.

**Invariants checked and upheld by the diff:** D8 domain separation (read
producer signs `application/forestrie-account-read+cwt`, never the onboard
type; producer output verified against a canopy-shape KS256 recovery check in
`register/test/account-read-attestation.test.ts`); read window 90 s inside
canopy's 300 s ceiling; `aud` = canopy origin; Authorization values never
logged or persisted; `registrationBlock` tri-state preserved in copy and
tests; D3 settlement posture honoured (202 → poll, no invented synchrony);
the credits route stays payment-is-the-authorization (no auth added).

**No High findings — merge is not blocked.** Mediums below are fix-in-stream.

## Findings

| ID  | Sev | Dim              | Location                                                         | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --- | --- | ---------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Med | Security/Correct | `ui/src/routes/fees/+page.svelte`                                | Quote→sign→submit not bound to one snapshot: the price shown comes from the 402 **body** (`amountAtomic`) while the signed value comes from the **header** option (`amount`) — never cross-checked; `credits` and `instanceId` are read live at submit, so edits between quote and pay send a resource URL that disagrees with the signed amount (opaque re-challenge). Network/asset from the challenge are signed unchecked against the configured chain. |
| R2  | Med | Correctness      | `+page.svelte` `startSettlementPoll`                             | The poll's `loadAccount(true)` re-reads the live `instanceId` field; switching instances mid-poll compares `creditsBalance` across different accounts and can report "credits landed" falsely.                                                                                                                                                                                                                                                              |
| R3  | Med | Test coverage    | `ui/src/lib/payments/canopy-client.ts`, `packages/tests/ui-e2e*` | No unit tests for the canopy client (402/202 expectations, problem-details vs `{error}` mapping, missing `X-PAYMENT-REQUIRED`); no hermetic e2e for `/fees` — the e2e kit has no canopy mock installer, so the surface has zero browser coverage.                                                                                                                                                                                                           |
| R4  | Low | Hygiene          | `ui/src/lib/payments/account-read-auth.ts`                       | `clearAccountReadAuthorizations()` is exported but never called on logout / wallet switch; a header minted by the wrong wallet can be replayed for up to ~75 s of avoidable 403s.                                                                                                                                                                                                                                                                           |
| R5  | Low | UX truthfulness  | `+page.svelte` `signAndPay`                                      | After a 202 the banner says "watching the balance…" even when the pre-purchase read failed (`before == null`) and no poll was started.                                                                                                                                                                                                                                                                                                                      |
| R6  | Low | Copy             | `fees` account card                                              | `arrears` renders as a raw ledger string with no units label.                                                                                                                                                                                                                                                                                                                                                                                               |
| R7  | Low | Posture (canopy) | `canopy-api/src/index.ts`                                        | #197 widens `Allow-Headers`/`Expose-Headers` for the whole API rather than payments-scoped. Accepted for the existing dev-CORS block; note only.                                                                                                                                                                                                                                                                                                            |

### Design holes & non-obvious details

- The x402 trust model is operator-trusting by construction (the client signs
  whatever `payTo`/`asset` the challenge names, as forestrie-cli does); R1's
  network/asset sanity check is the only hardening available client-side
  without changing the protocol.
- The read attestation is a bearer capability for its 90 s window (accepted in
  FOR-497's design; HTTPS-only transport). Anyone proposing to lengthen the
  window should read canopy plan-2607-07 first.
- Clock skew: a client more than ~90 s behind canopy mints already-expired
  attestations and sees uniform 403s. Deferred; a skew hint in the error copy
  would be the fix.

## Goal

Close R1–R3 on the `mandate-1` stream before or immediately after mandate#75
merges; R4–R6 ride along opportunistically; R7 is a note, no action.

## Approach

1. **R1** — snapshot `{univocityInstanceId, credits}` into the challenge state
   at quote time and use only the snapshot at submit; clear the quote when
   either input changes; before signing assert `body.amountAtomic ===
option.amount` and that `option.network` names the configured chain
   (`PUBLIC_DEFAULT_CHAIN_ID`) — refuse with explicit copy otherwise.
2. **R2** — pass the snapshot id into `startSettlementPoll`; add a
   `univocityInstanceId` equality guard to `creditsLanded`.
3. **R3** — unit-test `canopy-client.ts` with stubbed `fetch` (402 happy path,
   202 happy path, 402-on-submit, problem+json vs `{error}` mapping, absent
   challenge header); add a `canopy-payments` mock installer to
   `@forestrie/mandate-ui-e2e-kit` (Playwright `page.route` on the absolute
   canopy URL) and one `/fees` spec: load → balance renders; quote → sign
   (mock typed-data) → 202 → poll → landed.
4. **R4** — call `clearAccountReadAuthorizations()` from logout and on
   connected-address change.
5. **R5** — only claim "watching…" when a poll actually starts; otherwise say
   settlement is pending and offer manual reload.
6. **R6** — label arrears units once the ledger unit is confirmed from
   x402-settlement's receivables read.

Branch assignment: all items are mandate-side, same stream (`mandate-1`
post-merge or a follow-up branch per repo convention). No sibling-repo work:
R7 is explicitly no-action.

## Verification

- Unit: new `canopy-client` tests plus a regression test for the R1 snapshot
  (submitting after an input edit must be impossible / re-quoted).
- e2e: the `/fees` spec above green under `pnpm test:e2e:ui`.
- Manual: one live purchase on dev after canopy#197 deploys (smallest credit
  count), observing the 202 → poll → landed path against lane A.
