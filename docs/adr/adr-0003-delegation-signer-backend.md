# ADR-0003: Delegation signer backend and remote-signer contract

**Status:** ACCEPTED  
**Date:** 2026-06-22  
**Related:** [FOR-104](https://linear.app/forestrie/issue/FOR-104),
[ADR-0002](./adr-0002-delegation-signer-custody.md),
[plan-0005](../plans/plan-0005-for-104-signer-backend-spike.md)

## Context

FOR-98 ships `@mandate/agent` with `RemoteKs256Signer` posting only
`{ sigStructure }` to a per-log `signerUrl`. FOR-104 spikes compared Privy vs
GCP KMS as the production backend. See
[plan-0005](../plans/plan-0005-for-104-signer-backend-spike.md).

## Decision

### 1. Production backend

**Privy server wallet** via `secp256k1_sign` over `keccak256(sigStructure)` for
v1, unless compliance requires HSM (then GCP KMS + thin signer per checklist).

### 2. Remote-signer HTTP contract (v1 production)

Extend the FOR-98 minimal contract:

**Request** `POST /v1/sign` (or operator-configured `signerUrl`)

```json
{
	"logId": "<32-char hex>",
	"keyRef": "<opaque signer key id>",
	"rootSignerAddress": "0x<40 hex>",
	"sigStructure": "<base64 COSE Sig_structure bytes>"
}
```

| Field               | Purpose                                                    |
| ------------------- | ---------------------------------------------------------- |
| `logId`             | Selects operator forest; signer rejects unknown logs       |
| `keyRef`            | Maps to Privy wallet id or KMS cryptoKeyVersion            |
| `rootSignerAddress` | Signer verifies recovered address matches before returning |
| `sigStructure`      | Raw COSE to-be-signed bytes (signer computes keccak256)    |

**Response** `200`

```json
{
	"signature": "<base64 65-byte recoverable secp256k1 r||s||v>"
}
```

**Errors:** `4xx` for unknown `logId`/`keyRef`; `5xx` for vendor failures.

**Auth (agent → signer):** `Authorization: Bearer <token>` on every remote
`POST /v1/sign`. Default token is `MANDATE_SIGNER_TOKEN` (mandate-operated
**mandate-signer**, Mode C). Mode B user remote signers use a **separate**
bearer configured per descriptor (§5). Privy credentials stay on mandate-signer,
not in the agent.

### 3. Agent behaviour

- Continue using `buildDelegationCertificateKs256WithSigner` with backend
  `sign(sigStructure) => 65-byte sig`.
- **`verifyDelegationCertificateKs256` before material submit** (defense in depth):
  `@mandate/agent` calls `assertCertificateMatchesEvent` — signature verification
  against the descriptor `rootSignerAddress` plus `logId` / `mmrStart` / `mmrEnd`
  binding to the webhook event.
- **`requestKey` reservation:** mark seen with a short TTL before signing; re-mark
  with full TTL after successful submit; clear on failure. KV is eventually
  consistent; coordinator idempotency remains the hard backstop.
- `materialSubmitUrl` origin allowlist unchanged (FOR-98).

### 4. Per-log descriptor schema (FOR-100)

```json
{
	"<logIdHex32>": {
		"alg": "KS256",
		"rootSignerAddress": "0x...",
		"kind": "remote",
		"signerUrl": "https://signer.example/v1/sign",
		"keyRef": "privy-wallet-id-or-kms-version"
	}
}
```

### 5. Mode B remote bearer (FOR-207 / Package E)

Mode B descriptors may set optional `bearerEnvKey`: the name of an agent Worker
secret/env var whose value is sent as `Authorization: Bearer …` when posting to
that log's `signerUrl`. When `bearerEnvKey` is **absent**, the agent uses
`MANDATE_SIGNER_TOKEN` (unchanged Mode C and mandate-signer behaviour).

| Mode          | `signerUrl` target | Typical bearer                                          |
| ------------- | ------------------ | ------------------------------------------------------- |
| Mode C hosted | mandate-signer     | `MANDATE_SIGNER_TOKEN`                                  |
| Mode B BYOK   | user remote signer | env named by `bearerEnvKey` (e.g. `USER_SIGNER_BEARER`) |

If `bearerEnvKey` is set but the resolved env value is empty, the agent **fails
closed** (does not fall back to `MANDATE_SIGNER_TOKEN`).

Reference user signer for dev/e2e: `@mandate/reference-user-signer` (FOR-209).

## Alternatives considered

| Alternative                  | Why not v1                                                  |
| ---------------------------- | ----------------------------------------------------------- |
| Raw key in Worker / KV       | Violates non-custodial model (ADR-0002)                     |
| Agent calls KMS directly     | No ADC on Workers; exposes GCP creds                        |
| Pre-hashed `hash` in request | Leaks hash-only API; keep `sigStructure` for COSE alignment |
| GCP KMS without thin signer  | SA JSON in Worker is an anti-pattern                        |

## Consequences

- Production work: thin **mandate-signer** service (even for Privy) to hold vendor
  secrets and enforce `logId`/`keyRef` policy.
- **Owned-wallet path (S3, FOR-110):** per `KEY_DIRECTORY` entry with
  `requiresAuthorizationSignature: true`, `privy-sign` attaches
  `privy-authorization-signature` (RFC 8785 via the `canonicalize` package, ECDSA
  P-256 DER base64) and `privy-request-expiry` (Unix **milliseconds**) over the
  exact RPC body sent to
  `POST /v1/wallets/{id}/rpc`. App-controlled operator entries omit the flag (or
  set `false`); signer fails closed if the flag is set but
  `MANDATE_PRIVY_AUTHORIZATION_KEY` is unset.
- GCP path deferred unless HSM required; checklist documents ~1–2 day bootstrap.
- ES256 backends unchanged ([FOR-105](https://linear.app/forestrie/issue/FOR-105)).

## Confirmation

Accepted after FOR-104 spike (Privy `secp256k1_sign` over `keccak256(sigStructure)`)
and stakeholder sign-off. GCP KMS remains documented in
[`gcp-bootstrap-checklist.md`](../../spikes/for-104-delegation-signer/gcp-bootstrap-checklist.md)
for HSM requirements.
