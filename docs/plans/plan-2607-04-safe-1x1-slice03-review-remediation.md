# plan-2607-04 — Safe 1x1 slice 03 review remediation

**Status:** DRAFT
**Date:** 2026-07-30
**Related:** plan-2607-45 slice 03 (devdocs), FOR-502, mandate PR
[#80](https://github.com/forestrie/mandate/pull/80) (`ef28b87`), sibling gap
FOR-505 (coordinator), FOR-504 (webhook suppression, slices 03/04)

Findings from `/review-changes` of the slice 03 diff (`origin/main..ef28b87`,
single branch, implementation lens). Worst finding: **1 High** (sibling-repo
functional gap), 3 Medium. The High does not block merging #80 — the console
paths it affects are exactly the ones that already fail today for Mode D
(there was no Mode D before this slice) — but it blocks the plan-2607-45 demo
beat 5 on any `wallet_challenge` deployment and must land before slice 04
declares the mode usable end-to-end.

## R1 (High, sibling repo) — coordinator wallet-challenge rejects Safe roots

`post-auth-session.ts` KS256 branch requires the `personal_sign`-recovered
address to EQUAL the registered public root (`ks256AddressMatchesRoot`). A
contract account cannot produce `personal_sign`, so a Safe-rooted authority
log can never mint a control-plane session: on the deployed console
(`wrangler.jsonc` sets `COORDINATOR_AUTH_MODE=wallet_challenge`) Mode D
`/delegations` fails at session exchange with 403 "Signer does not match
registered publicRoot". Hermetic e2e masks this (`app_token_bff`).

Tracked as **FOR-505** (canopy/delegation-coordinator). Options, either:

- ERC-1271 challenge flavour: accept a SafeMessage-wrapped EIP-712 (or
  EIP-191) challenge signature and verify via the existing
  `createErc1271VerifyHooks` when the registered root has contract code
  (KS256_RPC_URL is already deployed for cert verify); or
- owner-of-root policy: recover the EOA, then authorise
  `getOwners(root).contains(recovered) && getThreshold(root) == 1`.

Mandate side (this repo, after coordinator lands): send the matching
signature flavour from `control-plane-session.ts` in safe mode.

**Acceptance:** a Safe-rooted log lists pending delegations and submits a
certificate on a `wallet_challenge` deployment; EOA-rooted logs byte-for-byte
unaffected; hermetic e2e gains a wallet-challenge-mode safe spec.

## R2 (Medium) — Safe validation passes pre-1.3.0 Safes that can never sign

`safe-validation.ts` checks code + `getOwners` + `getThreshold()==1` but not
the Safe version. Safe 1.1.1/1.2.0 domain separators omit `chainId` and their
fallback handlers lack `isValidSignature(bytes32,bytes)`, so an old Safe
validates in the console yet every SafeMessage fails at canopy/coordinator/
on-chain verify — fail-closed, but "validated ⇒ usable" (decision Q3 intent)
is broken with only confusing downstream errors.

**Fix:** probe `VERSION()` (selector `0xffa1ad74`, returns string) during
validation; require `>= 1.3.0`, reporting an `invalid` verdict naming the
version otherwise. Unit-pin the version gate.

**Acceptance:** a 1.1.1-shaped transport stub is rejected with an explicit
version reason; the 1.3.0+/1.4.x path unchanged.

## R3 (Medium) — stale injected-provider listeners mutate session state

`stores.svelte.ts` `bindProviderListeners` never detaches: reconnecting binds
duplicate handlers, and after disconnect (or switching wallets) the OLD
provider's `accountsChanged`/`chainChanged` still fire and overwrite
`state.address` / clear the Safe validation for a provider that is no longer
active.

**Fix:** keep handler references; `removeListener` on disconnect and before
rebinding; guard handlers with `if (provider !== activeProvider) return`.

**Acceptance:** connect → disconnect → connect a second provider; events from
the first provider are inert; no duplicate state transitions on reconnect.

## R4 (Medium) — contract revert misclassified as "chain unavailable"

Entering a non-Safe CONTRACT address makes `getOwners()` revert; both
transports throw uniformly, so `validateSessionSafe` reports `unavailable`
("Could not reach the chain — retry"). That inverts the canopy#200 posture in
the other direction: a definitive on-chain "no" is presented as an
availability problem with retry advice that can never succeed.

**Fix:** classify JSON-RPC execution reverts (error code `3`, and
`-32000`-family messages containing "revert") as an `invalid` verdict
("address does not implement the Safe owner interface"); keep transport/HTTP
failures as `unavailable`.

**Acceptance:** revert-shaped transport stub → `invalid`; HTTP 503 /
network-error stub → `unavailable` (existing test retained).

## Deferred (Low)

- e2e coverage for the `unavailable` validation state; unit coverage for
  listener rebinding (needs a DOM-ish store harness); `eip6963.ts` discovery
  unit test.
- `PUBLIC_RPC_URL` Base Sepolia defaults are hardcoded in three places while
  the chain comes from `PUBLIC_DEFAULT_CHAIN_ID` — single-source when a
  second chain lands, or assert `eth_chainId` matches at validation time.
- `signer-mode-picker.svelte` radiogroup lacks arrow-key navigation.

## Branch assignment

- R2/R3/R4: this branch (`mandate-1`) as a follow-up commit on #80 or an
  immediate successor PR — small, isolated, hermetically testable.
- R1: sibling repo (canopy/delegation-coordinator), FOR-505; the mandate
  flavour change lands after it.
- Deferred items ride with slice 04 or later.
