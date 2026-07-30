# plan-2607-05 — Safe 1x1 slice 04 (/onboard wizard) review remediation

**Status:** IMPLEMENTED (2026-07-30)
**Date:** 2026-07-30

> Implementation notes (post plan-2607-46): the design holes D1–D4 were fixed
> first (devdocs plan-2607-46, canopy #203/#204), which changed R1's shape —
> canopy redeem is now idempotent for this request's own retries (a
> `redeemed` request + valid code re-issues a fresh token, 410 on expiry), so
> the wizard's lost-token state is a simple retry, not a dead-end recovery
> card. Delivered on the mandate follow-up PR: R1 redeem retry +
> `OnboardRedeemError` (410 terminal → expired), R2 pinned `safeAddress` +
> `pinnedSafeGuard`, R3 `ensureForestR`/`applyGenesisResult`/
> `classifyRedeemFailure`/`repairFailureCopy` helpers with unit tests and
> signing-route-failure + publicRoot-repair e2e, R4 401-expiry copy, R6–R10
> lows, plus the plan-2607-46 mandate follow-up: the console safe branch now
> binds `envelope.chainId` into the wcc-1 challenge (kit 0.5.0 records the
> session envelope). R5 landed as a canopy test-only follow-up: same-test
> positive control (route flipped to http delivers) and the previously
> untested H4 standing-push suppression case.
> **Related:** devdocs plan-2607-45 slice 04; FOR-503 (mandate #81), FOR-504
> (canopy #202); review run 2026-07-30 (3 lenses: security/crypto,
> correctness/liveness, tests/standards; High/Medium claims re-verified against
> canopy source).

## 1. Review scope

- mandate `mandate-1` vs `origin/main` (PR #81): /onboard wizard, register
  `provision-mode-d`, coordinator client, e2e kit 0.4.0, specs.
- canopy `mandate-1` vs `origin/main` (PR #202): delegation-store wallet-mode
  webhook suppression + unit test.
- No Graphite metadata in either repo — reviewed as single branch vs main,
  cross-repo pair.

## 2. Findings

| ID  | Sev    | Dim                  | PR   | Location                                                                                  | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --- | ------ | -------------------- | ---- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | High   | Correctness          | #81  | `onboard-state.ts` deriveStep; canopy `handle-onboarding-request.ts:657-676`              | Lost-token redeem is a dead-end that bricks the instance: canopy redeem is one-shot (CAS → 409 "Request already redeemed") and **reservation happens at redeem**, so a crash between the server commit and the wizard's `persist()` leaves `requestStatus='redeemed'` with no token; every retry 409s and Start over cannot re-onboard the same instance (its reservation is held by the old request). Only recovery is the ops release route; the wizard has no messaging for any of this. |
| R2  | Medium | Security/Correctness | #81  | `+page.svelte` runGenesis/`runGenesisRetryForPublicRoot` (`wallet.safeAddress` read live) | The Safe address is not pinned at attestation time: genesis and the repair retry read the _currently connected_ Safe. Canopy never compares genesis `bootstrapKey` to the attested key (`handle-forest-request.ts` checks only chainBinding), and same-R retry takes bootstrapKey from the new body — so switching Safes mid-wizard registers a root that diverges from the attestation (and from a prior genesis's stored key on the coordinator side).                                    |
| R3  | Medium | Tests                | #81  | `+page.svelte:186-255`                                                                    | The load-bearing wizard logic is untestable page code with zero coverage: forestR-persisted-before-genesis, genesis-result application, signing-route-failure-after-genesis resume, and the publicRoot repair path all live only in `+page.svelte`. The fees/delegations pattern (pure helpers in `*-state.ts` + unit tests) is not applied to exactly the riskiest steps.                                                                                                                  |
| R4  | Medium | Liveness             | #81  | `+page.svelte` setWalletRoute                                                             | Repair loop dies with the onboard token: if coordinator publicRoot registration stays down past token TTL, genesis-retry 401s forever and the operator is stuck at signing-route (instance already registered to their R). Needs distinct messaging (token expired ≠ retry shortly) and an ops note — publicRoot can be registered out-of-band with the app token, after which `setLogSigningRoute` needs no onboard token.                                                                 |
| R5  | Medium | Tests                | #202 | `webhook-delivery.test.ts`                                                                | Suppression test can pass vacuously: `delivered === false` after a 50 ms sleep also holds if enqueue never ran or `waitUntil` is slow. Needs a same-test positive control (flip route to `http`, assert delivery) and an H4 standing-push suppression case (route-set → standing key → no push), which is currently untested.                                                                                                                                                               |
| R6  | Low    | Tests                | #81  | `onboard-wizard.spec.ts`, `onboard-state.test.ts`                                         | Reload spec under-asserts (no "no re-sign"/single-request assertion); rejected/expired path has no e2e (polling must stop); the unit test name "idempotent resume" for the redeemed-no-token state is wrong — canopy redeem is one-shot (see R1).                                                                                                                                                                                                                                           |
| R7  | Low    | Security             | #81  | `onboard-state.ts`                                                                        | redeemCode/onboardToken persist in sessionStorage indefinitely; nothing clears them at `done`. Post-genesis the token is CAS-bound to forestR so residual risk is replay-noise, but clear-on-done is cheap hygiene.                                                                                                                                                                                                                                                                         |
| R8  | Low    | UX                   | #81  | `+page.svelte` submitRequest                                                              | The univocity `eth_getCode` probe runs on the connected wallet's chain (or PUBLIC_RPC_URL's), but the error text claims "on chain {typed chainId}" — misleading when they differ. Fail-closed server-side either way (canopy re-probes on the typed chain). Reword.                                                                                                                                                                                                                         |
| R9  | Low    | Liveness             | #81  | `+page.svelte` pollStatus                                                                 | A poll mid-await at navigation re-arms `schedulePoll()` after `onDestroy` — harmless but leaks a timer writing sessionStorage post-unmount. Guard with a `destroyed` flag.                                                                                                                                                                                                                                                                                                                  |
| R10 | Low    | A11y                 | #81  | `+page.svelte` step list                                                                  | Step badges convey state by colour only; add `aria-current="step"`.                                                                                                                                                                                                                                                                                                                                                                                                                         |

### Design holes (cross-repo, not fixable on these branches)

- **D1 (canopy):** genesis accepts any 20-byte bootstrapKey; the D8 attestation
  binds the _request_, nothing binds the _genesis key_ to it, and same-R retry
  trusts the new body. The attestation is retained at
  `payments/attestations/{instanceId}.cose` — canopy could compare at genesis.
  → Linear follow-up (see §3, FOR-new).
- **D2 (canopy):** redeem is one-shot but `onboardTokenRef` already exists in
  the status view; an idempotent re-redeem (same redeemCode → same token ref)
  would dissolve R1's dead-end structurally. → same Linear follow-up cluster.
- **D3 (coordinator, pre-existing):** ERC-1271 verify uses one fixed
  `KS256_RPC_URL`, not the log's chain binding — wrong-chain contract at the
  same address could theoretically authenticate. Low likelihood (CREATE2);
  predates these PRs (canopy#200/#201).
- **D4 (noted, by design):** `GET /api/logs/{id}/pending-delegation` is
  unauthenticated and is now the sole delivery surface for wallet-routed logs.
  Confirm the exposure is still intended.

## 3. Remediation items

### On mandate PR #81 (branch `mandate-1`)

1. **R2 — pin the attested Safe** (do first; smallest surface, biggest
   correctness win): add `safeAddress` to `OnboardProgress`, set at
   `submitRequest` (the Safe that signs the attestation); `runGenesis` and the
   repair retry use `progress.safeAddress`; if the validated wallet Safe ≠
   pinned address, refuse with "reconnect the Safe this request was attested
   for". Unit tests in onboard-state.
2. **R1 — redeem dead-end handling:** on redeem 409 with no stored token, show
   a dedicated recovery card naming the requestId and univocityInstanceId,
   stating the instance is reserved for this request and pointing at the ops
   release path; do NOT offer Start over as the primary action for this state.
   Acceptance: e2e spec (kit gains a `redeemConflict` option).
3. **R3 — extract + unit-test the load-bearing steps:** `ensureForestR`,
   `applyGenesisResult`, `redeemOutcome` (409-aware), pinned-safe guard move to
   `onboard-state.ts`; unit tests pin forestR-before-genesis and the R1/R2
   semantics. e2e: signing-route failure after genesis (kit
   `signingRouteError` option) resumes at `signing-route` with the error shown;
   publicRoot repair path (`coordinator: {publicRoot:'error'}` then ok).
4. **R4 — distinct token-expiry messaging** in the repair path (401 → "onboard
   token expired; instance is registered — ops can complete coordinator
   registration, then retry this step").
5. **R6/R7/R8/R9/R10 —** reload-spec assertions, rejected-path e2e + kit
   `rejectAfterPolls`, rename the mislabeled unit test, clear
   redeemCode/onboardToken at `done`, reword the getCode error, destroyed-flag
   the poll loop, `aria-current`.

### On canopy PR #202 (branch `mandate-1`)

6. **R5 —** same-test positive control (route back to `http` → delivery
   observed) + H4 standing-push suppression test.

### Sibling repo / post-merge (Linear, not these branches)

7. **D1+D2 (canopy-api):** genesis-time bootstrapKey ↔ attestation comparison;
   idempotent re-redeem via `onboardTokenRef`. One issue, two acceptance
   criteria.

## 4. Deferred (Low)

- D3 chain-bound RPC selection for coordinator 1271 (pre-existing).
- Kit Buffer → Uint8Array cosmetic swap; `@types/node` devDep removal.
- Poll-interval env override for faster CI (only if flake is observed).
