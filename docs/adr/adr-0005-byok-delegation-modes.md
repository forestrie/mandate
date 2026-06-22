# ADR-0005: BYOK delegation modes — Option B reference, Option C hosted

## Status

Accepted (2026-06-22)

**Related:**
[devdocs ARC-0022 BYOK user-log delegation](../../../devdocs/arc/arc-0022-byok-user-log-delegation-and-operator-hosted-sealing.md)
(security model and invariants I1–I8),
[ADR-0002 custody](adr-0002-delegation-signer-custody.md),
[ADR-0003 signer backend](adr-0003-delegation-signer-backend.md),
[ADR-0004 delegation-cose distribution](adr-0004-delegation-cose-distribution.md),
[devdocs ARC-0019 grant verification](../../../devdocs/arc/arc-0019-grant-verification-model.md),
[devdocs ARC-021 payment onboarding](../../../devdocs/arc/arc-021-payment-onboarding/README.md)

## Context

Mandate is the **production-quality, freely forkable BYOK reference
implementation** for operating Forestrie/Canopy user logs. A mandate instance
onboards many independent **user logs**, collects payment for them, and
reimburses Canopy out of band (ARC-021). Sealing is **webhook-triggered**:
Canopy emits `delegation.required` per MMR window and mandate must return a
delegation certificate signed by the log's root authority `K(L)`.

Users of a hosted mandate want **full BYOK** (they own `K(L)`). Privy is an
acceptable backend, but **requiring a Privy custodial/managed key for the user's
root is not the goal** — true-BYOK users must be able to keep the root entirely
under their control.

ARC-0022 defines the platform security model (three keys, the
verification-anchor invariant, the kill switch, key export, and the
protocol-level exit). This ADR records mandate's product decision and the
Privy/mandate implementation specifics. The endstate for this instance is
**Mode C + Mode B + a per-user pending-delegations UI**: Mode C for users who do
not want to run a signer, Mode B (purist BYOK) for users who fork, and a shared
UI queue that also hosts the Mode C revocation control.

## Decision

1. **Mode B (purist BYOK) is the default reference path.** Per-log descriptors
   (ADR-0002 §3) use `kind: "remote"` with `signerUrl` pointing at the **user's
   own signer**. Mandate verifies and routes `delegation.required`; the user's
   backend signs the certificate with `K(L)`. **Mandate holds no user root key
   in this mode.** True-BYOK operators fork mandate and set `signerUrl` to their
   own signer. (ARC-0022 §4.1; invariants I1, I3.)

2. **Mode C (hosted convenience) is offered for users who will not run a
   signer.** The user owns a **Privy wallet** whose secp256k1 key is `K(L)`;
   mandate is registered as a **revocable additional signer** constrained by a
   policy to `secp256k1_sign` of delegation payloads. Mandate signs the
   certificate hands-off via the Privy **owned-wallet** path. This is
   _Privy-custodied, user-authorized_ — **not full BYOK**, and documented as
   such to users. (ARC-0022 §4.2; invariants I1, I6.)

3. **Owner-topology rule (normative for Mode C).** The Privy wallet **owner**
   MUST be the **user alone** (or a key quorum in which mandate is **not** a
   satisfying member). Mandate MUST be an **additional signer only** and MUST
   NOT be placed in the owner key quorum. This preserves the user's kill switch
   (ARC-0022 I2 → I3) and is the explicit rejection of Privy's "1-of-k quorum
   owner including the server key" offline-update pattern.

4. **No Canopy / delegation-cose changes.** Modes B and C both produce
   **single-hop** certificates signed by `K(L)`, verified against the registered
   `publicRoot` (ARC-0022 I5). The multi-hop **Mode A** chain (which would give
   hands-off _and_ true BYOK) is **deferred** and is not in scope here; if
   pursued it requires a separate canopy ARC and `@forestrie/delegation-cose`
   work.

5. **Per-user pending-delegations UI.** A per-log queue serves both modes: for
   Mode B it is the actionable approve/sign surface; for Mode C it is
   audit/observability plus a prominent **"Revoke mandate's signing access"**
   control wired to Privy `revokeWallets` / `PATCH /v1/wallets/{id}`
   (`additional_signers: []`). (ARC-0022 §6, §11.2.)

6. **Mode C uses the ADR-0003 "S3" owned-wallet authorization signature.**
   `@mandate/signer` implements the Privy `privy-authorization-signature`
   (RFC 8785 via `canonicalize`, ECDSA P-256 over SHA-256, DER base64) when the
   `KEY_DIRECTORY` entry has `requiresAuthorizationSignature: true` and
   `PRIVY_AUTHORIZATION_KEY` is configured. App-controlled operator entries omit
   the flag. Mode C onboarding (wallet + additional signer + Privy policy) is
   tracked separately (FOR-112).

7. **Operator vs user logs are distinct.** The mandate operator's own
   payment-authoritative log uses an **ownerless app-controlled** Privy server
   wallet (`KEY_DIRECTORY` entry without `requiresAuthorizationSignature`). User
   logs use Mode B or Mode C as above. The operator wallet model is **not** Mode
   C and has no user kill switch (it is the operator's own key).

8. **Documented exits.** Mode C users have a layered exit (ARC-0022 §7–§8):
   revoke the additional signer, optionally continue under Mode B with the same
   key (no re-registration, since `publicRoot` is unchanged), export the key for
   self-custody, and — when a Privy/operator compromise is suspected — perform
   the **protocol-level exit** (rotate `K(L)` / re-register the grant `kid`),
   which is the only exit that defends against prior key exposure.

## Implementation notes

### Privy

- **Mode C wallet:** create user-owned; set `owner`/`owner_id` to the user (or
  user-controlled quorum). Add mandate via `additional_signers` with a policy
  scoped to `secp256k1_sign`.
- **Signing:** owned-wallet path — `secp256k1_sign` with `params: { hash }`
  (no `encoding` key) plus `privy-authorization-signature` from mandate's
  additional-signer key.
- **Revocation:** owner-signed `PATCH /v1/wallets/{id}` or SDK
  `removeAllSigners` / `revokeWallets`.
- **Export:** owner-only; see ARC-0022 §7.1 for assumptions/weaknesses.

### Mandate

- **Descriptors** (ADR-0002 §3) per user log:
  `{ alg: "KS256", rootSignerAddress, kind: "remote", signerUrl, keyRef }`.
  Mode B → `signerUrl` = user signer; Mode C → `signerUrl` = mandate-signer,
  `keyRef` → user `walletId` + additional-signer auth.
- **`KEY_DIRECTORY`** scales one entry per `keyRef`; Mode C entries carry the
  user `walletId`, `rootSignerAddress`, and `requiresAuthorizationSignature:
true`.
- **Agent** stays mode-agnostic via `resolveSigner(logId)`.
- **Signer** implements the owned-wallet authorization-signature path (decision 6;
  FOR-110).
- **UI** adds the per-log pending-delegations queue + revoke control (decision 5).

## Consequences

- Mandate ships a true-BYOK path (B) with **no key custody**, and a hosted path
  (C) whose custody trade-off and kill switch/exit are explicitly documented.
- No coordinator/protocol changes are needed to ship B and C; the platform
  verification anchor (ARC-0022 I5) is untouched.
- Mode C signer crypto (S3 authorization signature) is implemented; onboarding
  (FOR-112), kill switch (FOR-114), and hands-off e2e (FOR-113) remain. Mode C
  still depends on Privy availability for revocation/export; the protocol-level
  exit (ARC-0022 §8) is the Privy-independent backstop.
- Security posture is bound to ARC-0022 invariants I1–I8 rather than restated
  here, keeping a single source of truth.

## Alternatives considered

- **Mode A standing sub-delegation chain now.** Rejected for v1: delivers
  hands-off + true BYOK but requires new `@forestrie/delegation-cose` chain
  support and coordinator verification. Deferred to a future ARC.
- **Mandate in the owner key quorum (offline updates).** Rejected: it would let
  mandate update/remove signers and break the user kill switch (violates
  ARC-0022 I2/I3). Mandate needs only signer capability.
- **Privy key import marketed as "BYOK".** Rejected as a BYOK claim: the key
  still resides in Privy's TEE; this is Mode C custody, not full BYOK. It may be
  offered only with the same disclosures as Mode C.
- **Raw user keys in Worker secrets / KV.** Rejected (ADR-0002): violates the
  non-custodial model.
