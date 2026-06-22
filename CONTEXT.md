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
