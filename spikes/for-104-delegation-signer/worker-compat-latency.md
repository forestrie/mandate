# Worker compatibility and latency (FOR-104)

Notes from spike implementation for Privy vs GCP KMS as remote signer backends.

## Privy

| Aspect                    | Assessment                                                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Worker call**           | Direct `fetch` to `https://api.privy.io/v1/wallets/{id}/rpc`                                                        |
| **Auth**                  | Basic (`app-id:app-secret`) + `privy-app-id` header; optional `privy-authorization-signature` when wallet has owner |
| **Credentials in Worker** | `PRIVY_APP_SECRET` as Worker secret (same class as other API keys)                                                  |
| **Signature shape**       | 65-byte recoverable hex (`v` as 27/28) — minimal conversion                                                         |
| **Mock latency**          | ~3 ms (local)                                                                                                       |
| **Expected live latency** | ~100–400 ms (Privy API round-trip + cold start)                                                                     |
| **Fork model**            | Operator creates Privy app; server wallet per forest root                                                           |

**Pros:** No extra service; aligns with existing `@mandate/ui` Privy integration;
simplest Worker deployment.

**Cons:** Vendor custody model (MPC/TEE); authorization signature flow for owned
wallets adds server-side key management.

## GCP KMS

| Aspect                    | Assessment                                                                |
| ------------------------- | ------------------------------------------------------------------------- |
| **Worker call**           | **Not direct** — KMS REST needs OAuth bearer; no ADC on Workers           |
| **Auth**                  | `Authorization: Bearer` from SA / WIF / thin service                      |
| **Credentials in Worker** | Should **not** hold SA JSON; use thin signer + shared secret              |
| **Signature shape**       | DER without `v` — spike adds DER→recoverable + address match (~7 ms mock) |
| **Mock latency**          | ~7 ms (DER path)                                                          |
| **Expected live latency** | KMS sign ~50–150 ms + thin service hop ~20–50 ms                          |
| **Fork model**            | Dedicated GCP project + HSM key + signer service per operator             |

**Pros:** HSM-backed keys; clear custody boundary; forestrie-independent GCP
project.

**Cons:** Higher bootstrap effort; almost certainly requires **thin signer
service**; fork operators need GCP billing + KMS expertise.

## Recommendation (spike)

For **v1 production** and **fork-friendliness**, prefer **Privy server wallet**
(`secp256k1_sign`) unless mandate-specific GCP project bootstrap (see checklist)
is already justified for compliance/HSM requirements.

GCP KMS remains the right path when operators require HSM/FIPS and accept the
thin-signer + dedicated-project operational cost.
