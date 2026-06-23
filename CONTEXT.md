# Mandate domain glossary

Terms used across the mandate monorepo (`ui`, `agent`, `register`).

## delegation agent

The `@mandate/agent` Worker that receives coordinator webhooks and produces
signed delegation material on behalf of the operator.

## delegation.required

Coordinator webhook event (`type: delegation.required`, `version: 1`) requesting
that the operator sign delegation material for a pending checkpoint range.

## delegation certificate

A COSE Sign1 object authorizing a delegated public key for an MMR range on a
log. Produced by the operator forest root key.

## delegation material

The tuple submitted to the coordinator: delegated public key CBOR plus delegation
certificate.

## operator root key

The forest authority key registered as the log's public root. Delegation
certificates must verify against this root.

## delegation signer

Pluggable component that builds delegation certificates. **Local** signers hold
a raw key (dev/test only). **Remote** signers send to-be-signed bytes to an
external service and never hold private key material in the agent.

## request key

Deterministic idempotency key for a `delegation.required` webhook
(`SHA-256(logId:mmrStart:mmrEnd:delegatedPubkeyHash)`).

## webhook signing key

The coordinator's ES256 identity used to sign outbound webhooks. Published as a
JWKS at `/.well-known/forestrie-webhook-jwks.json`; agents verify signatures
over `{timestamp}.{rawBody}`.

## operational secret

A long-lived credential for the mandate **instance** (Privy app, mandate
additional-signer key, Workers deploy tokens). Stored in Doppler `dev`/`prod` and
GitHub `prod`. Prefixed `MANDATE_` (see ADR-0006).

## E2E fixture secret

A credential or URL used **only** to run live integration tests against real dev
infra (synthetic Mode C test user wallet, dev Canopy/coordinator endpoints).
Stored in Doppler config `e2e` and GitHub `live-signer` — never production.
Prefixed `E2E_` (see ADR-0006).

## Mode C user wallet

A user's root authority `K(L)` held in a Privy wallet they control via an owner
authorization key; mandate is an **additional signer** only (I2). Custody is
Privy-custodied (not true BYOK / Mode B); the user can revoke mandate at Privy
(I3). See ADR-0005 and ARC-0022.

## operator payment-authoritative wallet

The mandate operator's own payment-authoritative log root signer: an **ownerless
app-controlled** Privy server wallet (`owner_id: null`), signed via Basic auth
with no `requiresAuthorizationSignature`. Distinct from Mode C user wallets;
the operator controls this key directly. See ADR-0005 §7 and ARC-0022 §11.1.

## signer test wallet

A synthetic **user-owned** Privy wallet used only in live integration tests
(`E2E_SIGNER_TEST_*`). Mandate is registered as an **additional signer** with a
delegation policy; the wallet is never revoked so `test:live:owned` and the
hands-off success path stay stable. Distinct from the Mode C kill-switch wallet
(`E2E_MODE_C_USER_*`). See [service-secrets.md](docs/service-secrets.md).

## delegation control plane

HTTP management APIs on the delegation-coordinator (`pending`, `material`,
`enabled`, `signing-route`). Authenticated via wallet-challenge sessions in v1.
See devdocs [ARC-0023](../devdocs/arc/arc-0023-wallet-challenge-control-plane-auth.md).

## control-plane session

Short-lived bearer after a wallet proves control of an authority log root key.
Used by the mandate UI BFF when calling coordinator UX APIs.

## authority log

The log identified by `authLogId` whose registered `publicRoot` anchors
control-plane authorization. In BYOK single-hop mode, `authLogId` equals the
user log id.

## registered publicRoot

Root key material on the coordinator for a log; same anchor as delegation
certificate verification (ARC-0022 I5).

## proof-of-possession

Wallet signature over a challenge using a candidate root key before genesis
registers that key on the coordinator.
