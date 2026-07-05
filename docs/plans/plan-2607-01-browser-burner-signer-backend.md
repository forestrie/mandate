---
id: 2607-01
status: active
created: 2026-07-04
refs: [ADR-0005, ARC-0022, FOR-322]
---

# Plan 2607-01 — browser burner signer backend

**Status:** ACTIVE · **Created:** 2026-07-04

**Related:** [ADR-0005 BYOK delegation modes](../adr/adr-0005-byok-delegation-modes.md),
[ARC-0022 BYOK user-log delegation](../../../devdocs/arc/arc-0022-byok-user-log-delegation-and-operator-hosted-sealing.md)
(invariants I1–I8, exits §7–§8),
[FORKING.md §5b Mode B](../../FORKING.md#5b--mode-b-user-log-purist-byok),
signing seam `packages/apps/ui/src/lib/signing/signing-backend.ts`.
Linear issue: [FOR-322](https://linear.app/forestrie/issue/FOR-322).

## Context

The product claim we most need to _demonstrate_, not just assert, is
**"own your keys if you want, and exit with zero friction"**: a user holding
`K(L)` can revoke a hosted operator (Mode C) and continue signing their own
delegation certificates under Mode B — pointed at any canopy × arbor operator —
with **no re-registration** (the `publicRoot` verification anchor is unchanged;
ARC-0022 I5). ADR-0005 §8 / the exit gradient (steps 3–5) is the whole point of
mandate as a reference implementation.

The demo is currently blocked by an irony in our _default_ wallet: **Privy is
itself custodial.** The Mode C→B story says "the user was always in control of
the root key," but with the default Privy embedded wallet the key lives in
Privy's TEE and the user cannot freely take it to another operator — being
unable to hold the key is _precisely the failure mode Forestrie exists to
avoid_. So the current UI path (`new PrivyEoaBackend()` at
`packages/apps/ui/src/lib/signing/delegations/+page.svelte:236`) makes the exit
demo depend on the one component that contradicts the claim.

The signing surface is already abstracted behind a clean seam —
`SigningBackend` (`signing-backend.ts`), with `PrivyEoaBackend` and the
`SafeBackend` stub as implementations, selected at the single call site above.
A hermetic double already exists (`VITE_E2E_PRIVY_MOCK` →
`privy/mock-client.ts`), proving the seam takes alternate providers. This plan
adds a **third backend**: a browser-local **burner key** the user (or, at
deploy time, the harness) fully controls.

**Framing / non-goals.** mandate is a _minimal_ demo of what a real forest
operator console could offer, and is expected to be **forked**. The weak
security posture of a raw browser-held burner key is acceptable _for this
purpose_ and must be labelled as such. Privy stays the **default for the live
`mandate-forestrie` instance**; a forker who wants a different custody model
swaps the backend. Crucially: **once we know the burner-key backend works
end-to-end, we no longer need to exercise the Privy integration to prove the
BYOK/exit properties** — if Privy ever could not support the signing we need,
we would simply use a different wallet. This plan does not change canopy,
`@forestrie/delegation-cose`, the Mode C onboarding/revoke CLIs, or the
reference-user-signer (Mode B server signer) — it is UI + deploy-config only.

## Goal

Ship a `LocalBurnerBackend` implementing `SigningBackend`, plus the
deployment-time and runtime wiring to select it over Privy, so that the Mode
C→B exit and "own-your-keys" properties can be demonstrated and **system-tested
end-to-end with the operator/user in genuine, exportable control of `K(L)`** —
no Privy dependency in the demo path.

## Decisions

Committed choices (alternatives weighed and rejected — kept here so the record
survives, not to reopen):

- **D1 — Selection is deploy-time env, prod stays Privy.** A new
  `PUBLIC_MANDATE_SIGNER_BACKEND` (`privy` | `burner`, **default/blank ⇒
  `privy`**) picks the backend per deployment, read via `$env/static/public`
  like the existing `PUBLIC_DEFAULT_CHAIN_ID`. A **build-time guard**
  (`import.meta.env`) drops the `local-burner-*` modules from any bundle where
  the backend isn't `burner`, so the burner key path can never ship to the live
  instance. The selection goes through a `resolveSigningBackend()` factory
  written so a future _dev-only_ runtime toggle can layer on without reshaping
  callers. _(Rejected: runtime toggle as baseline — foot-gun in prod; two build
  variants as the only mechanism — heavier than needed.)_
- **D2 — Deploy-time key seeding: fixture inject + interactive create.**
  System-testing seeds `localStorage` via Playwright `addInitScript` (the key is
  a fixture, exactly like the `E2E_SIGNER_TEST_*` wallets in ADR-0005 and the
  `VITE_E2E_PRIVY_MOCK` precedent). Interactive demos use a create / paste /
  export path in the UI. _(Rejected: serving a pre-minted private key from a
  deploy endpoint — that is the exact anti-pattern we're demonstrating against.)_
- **D3 — Hard switch: burner mode hides Privy wallet UI.** When `burner` is
  active the console shows no Privy login/connect; the demo turns on _one_
  obviously user-controlled key. Console auth (app-token/BFF, `lib/auth/*`) is
  separate from wallet signing and is unaffected — the factory supplies the
  signing address that `getPrivySessionState()` supplies today.
- **D4 — Raw hex in `localStorage`.** No passphrase/keystore encryption — the
  page can read the key regardless, so encryption would be theatre that
  contradicts "zero friction." The **"for demo purposes"** disclaimer does the
  honest work.

## Approach

### A. `LocalBurnerBackend` (core seam implementation)

New `packages/apps/ui/src/lib/signing/local-burner-backend.ts` implementing
`SigningBackend` (`kind: 'eoa'`):

- Holds a secp256k1 private key read from `localStorage` (raw hex, **D4**).
  Signs `keccak256(Sig_structure)` with `@noble/curves/secp256k1` and returns
  the 0x-prefixed 65-byte recoverable hex the seam expects — mirroring the
  server-side pattern in `reference-user-signer/src/key-store.ts` /
  `sig-utils.ts` and the test helper `testRootFromPrivateKey(...)` in
  `build-browser-delegation-certificate.test.ts`. No Privy `v` normalization
  needed (we control the recovery id); reuse `ks256-sig-utils.ts` where possible.
- Derives `rootSignerAddress` = `keccak_256(pub[1:])[-20:]` and exposes it, so
  the call site passes it where Privy's connected address goes today. Keeps
  `buildBrowserDelegationCertificate(input, rootSignerAddress, backend)`
  unchanged.
- `isAvailable()` → a burner key is present in storage.
- A tiny key module (`local-burner-key.ts`): `loadKey()`, `createKey()`,
  `exportKey()`, `clearKey()`, `getAddress()`, storage-key constant.

### B. Backend selection + deployment-time config (D1)

Add `PUBLIC_MANDATE_SIGNER_BACKEND` to `packages/apps/ui/.env.example`
(default/blank ⇒ `privy`). Replace the direct `new PrivyEoaBackend()` at
`+page.svelte:236` with a `resolveSigningBackend()` factory (new
`signing/resolve-backend.ts`) returning the configured backend and its address
source. Guard the `local-burner-*` imports behind the build-time flag so they
tree-shake out of non-`burner` bundles.

### C. Burner UX in the delegation console (D3)

When the burner backend is active and no key is present, the console shows a
**"Create burner wallet"** action, prominently badged **"⚠ For demo purposes —
this key lives unencrypted in your browser."** Plus:

- **Export** button → downloads / copies the raw private-key hex (and address).
- **Clear** button → removes the key (models the "throw it away" story).
- The signing flow reads the address from the burner backend; Privy
  connect/login UI is hidden in this mode. `signAndSubmit` currently gates on
  `session.address` — the factory must supply that from the burner.

### D. Deploy-time / system-testing pre-population (D2)

System-testing seeds `localStorage` with a deploy-time-minted key via Playwright
`addInitScript`, so a run starts already holding a known `K(L)` and can drive
the full **onboard → sign → revoke Mode C → continue Mode B same key → export**
gradient non-interactively. Mint the fixture key with the same tooling as
`reference-user-signer` keys so Mode B and burner share one key-provenance story.
Interactive demos use the create/paste/export path from §C.

### E. Docs

- ADR-0005: add the burner backend to the "Documented exits" / demo narrative as
  the _frictionless self-custody_ backend, explicitly contrasting it with Privy
  custody and noting it is the seam we test the exit against.
- FORKING.md: a short "Demo/system-test with a burner key" note next to §5b.
- README/UI copy carries the "for demo purposes" disclaimer verbatim.

## Verification

**End-to-end demo (the actual acceptance criterion):** with
`PUBLIC_MANDATE_SIGNER_BACKEND=burner`, run the full exit gradient against a
lane-b canopy × arbor stack and observe, with **no Privy involved**:

1. Create (or deploy-seed) a burner key; onboard a user log whose `K(L)` is that
   key (canopy genesis `bootstrapKey` = burner address — ADR-0005 §7, canopy is
   custody-agnostic).
2. Sign a `delegation.required` window via `LocalBurnerBackend` → certificate
   verifies against the registered `publicRoot` (`buildBrowserDelegationCertificate`
   path, KS256).
3. Demonstrate **exit with zero friction**: point the same key at a _different_
   canopy × arbor operator (or Mode B signer) and sign again — **no
   re-registration**, `publicRoot` unchanged (ARC-0022 I5). This is the money
   shot for the product claim.
4. **Export** the key; confirm it round-trips (re-import elsewhere signs an
   equivalent certificate).

**Automated (system-testing, D2):** a Playwright spec seeds the burner key via
`addInitScript` and drives sign+submit hermetically — burner analog of the
existing `sign-submit.spec.ts` / `pending-list.spec.ts`, no live Privy.

**Unit:** `local-burner-backend.test.ts` reusing the
`testRootFromPrivateKey`/`TEST_PRIVATE_KEY_HEX` fixtures already in
`build-browser-delegation-certificate.test.ts` to assert the burner signature
verifies through `verifyDelegationCertificateKs256`.

**Guardrails:** assert prod default is `privy` (missing/blank env ⇒ Privy);
assert the "for demo purposes" disclaimer renders whenever the burner backend is
active; assert burner modules are absent from a `backend=privy` build (D1 guard).

## Implementation status (FOR-322)

| Slice                                        | Status   | Notes                                                                                                                       |
| -------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------- |
| A — `LocalBurnerBackend` + key store         | Done     | `signing/local-burner-{key,backend}.ts`; unit-verified via `verifyDelegationCertificateKs256`                               |
| B — `resolveSigningBackend` + env            | Done     | `signing/resolve-backend.ts`; `$env/dynamic/public` (blank ⇒ privy, no build break); burner code-split via dynamic import   |
| C — Burner console UX                        | Done     | Burner card (create/export/clear + disclaimer); Privy wallet UI hidden in burner mode                                       |
| D — System-test seeding + hermetic spec      | Done     | `seedBurnerKey()` (addInitScript); `burner-sign-submit.spec.ts` + `playwright.burner.config.ts` (`task test:e2e:ui:burner`) |
| E — Docs                                     | Done     | ADR-0005 §"Demo/system-test burner backend"; FORKING §5c                                                                    |
| Build-time strip of burner chunk (D1 strict) | Deferred | Dynamic import code-splits but does not fully drop the chunk; verification follow-up                                        |

**Discovered during D:** the delegation console's **coordinator control-plane
session** (used for `listPendingDelegations`, enabled reads/writes) also signed
its challenge via Privy. Burner mode was non-functional until
`control-plane-session.ts` was made backend-aware (EIP-191 `personal_sign` with
the burner key).

**FOR-129 reconciliation (checked 2026-07-05):** FOR-129 (wallet-challenge
control-plane auth) is **already merged** — squash PR #6 (`d80ebd8`) on `main`,
Linear "Done". This branch is cut from current `main`, so it **builds on** merged
FOR-129 rather than racing it; `control-plane-session.ts`/`-core.ts` are
byte-identical to the merged version, and the burner branch is an additive
extension of FOR-129's injected `signMessage` seam. The burner EIP-191 output
matches FOR-129's `recoverMessageAddress` verification (unit-tested). The stale
`feat/for-129-wallet-challenge-bff` worktree (forked 2026-06-23) is **leftover**
and should be pruned — its only not-on-`main` content is commit `cbb1ace` (ES256
session `publicKeyX/Y`), a spike toward the **ES256-envelope follow-up**
(`plan-wallet-challenge-followups.md`). Forward reconciliation is only with the
**ES256 envelope** and **genesis proof-of-possession** follow-ups: extend the
burner signer in lockstep when those land (the burner is the natural demo signer
for genesis PoP).

**Caveat (external):** in-flight sealing/checkpoint work may keep full live
system tests / deployment from going green independent of this change. The
hermetic burner e2e above does not depend on the sealing pipeline.

## Open questions

- Do we also want a burner path for the **operator payment-authoritative** log
  in system-testing (today an ownerless app-controlled Privy server wallet,
  ADR-0005 §7), or keep this UI-only (user-log signing)? Default: UI-only.
- Confirm no other call sites construct `PrivyEoaBackend` directly (grep shows
  only `+page.svelte:236` + the stub) before routing through the factory.

## Review findings (2026-07-05, review-changes + adversarial crypto pass)

Crypto verified correct: KS256 (raw keccak) and EIP-191 personal_sign schemes
are distinct (not swapped), both low-S, domain-separated by the EIP-191 prefix,
and round-trip tested against `verifyDelegationCertificateKs256` /
`recoverMessageAddress`. Findings, worst first:

| ID  | Sev                     | Location                                                   | Finding                                                                                                                                                                                                    | Action                                                                                                                        |
| --- | ----------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| R1  | ~~High (CI)~~ **fixed** | `+page.svelte`                                             | `{:else}` block not reindented → `prettier --check` (root `lint`) fails                                                                                                                                    | Fixed in-branch (`style(ui): prettier reindent…`)                                                                             |
| R2  | Medium                  | `resolve-backend.ts`, build                                | Burner chunk ships in the Privy bundle; activation rests solely on `PUBLIC_MANDATE_SIGNER_BACKEND`. Default is fail-safe (blank/unknown ⇒ privy) but there is no build-time strip or prod-hostname refusal | = deferred D1. Land the build-time guard (and/or a runtime refusal on a production origin) **before** the live instance ships |
| R3  | ~~Low~~ **fixed**       | `local-burner-backend.ts`, `local-burner-personal-sign.ts` | `sig.recovery` can be 2/3 (r ≥ n, ~2⁻¹²⁷) → v strict verifiers reject                                                                                                                                      | Both signers now assert `recovery ∈ {0,1}` and throw otherwise                                                                |
| R4  | ~~Low~~ **fixed**       | same                                                       | `sig.recovery ?? 0` masked an undefined into a wrong v                                                                                                                                                     | Same guard removes the `?? 0` fallback                                                                                        |
| R5  | Low (deferred)          | `+page.svelte` `exportBurner`                              | Clipboard-failure fallback renders the private key into the DOM `message`                                                                                                                                  | Download-only / masked reveal — deferred (demo-only fallback)                                                                 |
| R6  | ~~Low~~ **fixed**       | `ks256-sig-utils.ts` + caller                              | `normalizePrivyKs256Signature` was backend-agnostic; name misled                                                                                                                                           | Renamed `normalizeKs256Signature` (3 refs)                                                                                    |
| R7  | ~~Low~~ **fixed**       | `resolve-backend.test.ts`                                  | No test on the factory default / burner selection                                                                                                                                                          | Added: `blank/unknown ⇒ privy`, `burner` only on exact trim+lowercase match                                                   |

R2 is the only pre-live blocker (tracked as D1). R1, R3, R4, R6, R7 are resolved;
R5 (demo-only clipboard fallback) is deferred.
