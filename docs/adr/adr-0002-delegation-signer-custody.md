# ADR-0002: Delegation signer custody and webhook trust

## Status

Accepted (FOR-98)

## Context

The mandate delegation agent receives `delegation.required` webhooks from the
Forestrie delegation coordinator, signs delegation certificates with the
operator's forest root key, and submits material back to the coordinator.

Operators run mandate in their own Cloudflare account (fork-friendly). The agent
must not become a custodian of operator private keys in production.

The coordinator verifies submitted certificates against each log's registered
public root (ES256 or KS256). Webhooks are authenticated with an ES256 signature
over the raw JSON body.

## Decision

1. **Remote signing is the production model.** The agent builds COSE to-be-signed
   bytes and calls a per-log remote signer (`RemoteKs256Signer`). Private keys
   never reside in the Worker.

2. **Local raw-key signing is dev/test only.** `LocalKs256Signer` supports local
   development and component tests. It is not the production deployment path.

3. **Per-log signer descriptors, not static secret bindings.** Configuration maps
   `logId → { alg, rootSignerAddress, kind, signerUrl? }`. Unknown `logId`
   webhooks are rejected before signing. FOR-100 provisioning writes descriptors
   to a runtime store the agent can resolve dynamically.

4. **JWKS trust for webhook verification.** The coordinator publishes
   `GET /.well-known/forestrie-webhook-jwks.json`. The agent fetches and caches
   keys by `kid`, refetching on verification miss.

5. **KS256 first.** v1 implements KS256 delegation certificates behind a
   `DelegationSigner` interface. ES256 roots and algorithm selection follow in a
   separate issue.

## Consequences

- Production signer backend choice (Privy server wallet vs GCP KMS in a
  mandate-specific GCP project) is deferred; see Linear follow-up for the
  delegation signer backend design.
- `@forestrie/delegation-cose` is consumed as a versioned package from GitHub
  Packages (see ADR-0004) so forks install without cloning canopy.
- Component tests mock the coordinator; live end-to-end provisioning remains
  FOR-101.

## Alternatives considered

- **Raw keys in Worker secrets / KV:** rejected for production — agent would
  hold key material and secret bindings are static per deploy.
- **Bespoke single-key webhook endpoint:** rejected — JWKS supports rotation
  without hard cutover.
- **ES256-only v1:** rejected — current BYOK demo uses KS256 (Ethereum EOA)
  roots.
