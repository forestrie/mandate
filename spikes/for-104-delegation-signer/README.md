# RETIRED — FOR-104 spike — delegation signer backends

> **RETIRED** (FOR-366, plan-2607-13 M3). **Superseded** by production
> `@mandate/signer` (`packages/apps/signer/`). This spike is kept for the
> historical Privy vs GCP KMS comparison only; do not extend it, and do not
> use it for Mode C S3 authorization signatures — use the signer Worker
> instead. It is no longer installable as-is: its GitHub Packages `.npmrc`
> was removed (mandate installs `@forestrie/*` from public npmjs, FOR-336)
> and its lockfile still pins the retired `npm.pkg.github.com` tarball.

> spike env vars use legacy `PRIVY_*` names; production naming is
> [ADR-0006](../../docs/adr/adr-0006-privy-secrets.md).

Runnable PoCs (historical) comparing **Privy server wallets** vs **GCP Cloud
KMS** as the production KS256 remote signer for `@mandate/agent`.

## Quick start (historical — no longer runnable without reviving installs)

```sh
cd spikes/for-104-delegation-signer
pnpm install --ignore-workspace   # will not resolve; see RETIRED note above
pnpm test
pnpm spike
```

All three backends (local control, Privy mock, GCP KMS mock) must pass the
`verifyBackend` gate: `buildDelegationCertificateKs256WithSigner` +
`verifyDelegationCertificateKs256`.

## Flip to live

### Privy

```sh
export SPIKE_LIVE=1
export PRIVY_APP_ID=...
export PRIVY_APP_SECRET=...
export PRIVY_WALLET_ID=...
# If wallet has an owner / quorum:
export PRIVY_AUTHORIZATION_SIGNATURE=...

pnpm spike
```

`rootSignerAddress` registered on the log must equal the Privy wallet Ethereum
address. Use the same Privy app as `@mandate/ui` or a dedicated server-wallet
app per operator.

### GCP KMS

```sh
export SPIKE_LIVE=1
export GCP_KMS_KEY_NAME=projects/.../locations/.../keyRings/.../cryptoKeys/.../cryptoKeyVersions/1
export GCP_ACCESS_TOKEN=$(gcloud auth print-access-token)

pnpm spike
```

The KMS key must be `EC_SIGN_SECP256K1_SHA256` (HSM). `rootSignerAddress` must
match the Ethereum address derived from the KMS public key (see
`gcp-bootstrap-checklist.md`).

## Layout

| File                         | Purpose                                              |
| ---------------------------- | ---------------------------------------------------- |
| `src/harness.ts`             | `SignerBackend`, `verifyBackend`, test fixtures      |
| `src/privy-backend.ts`       | Privy `secp256k1_sign` RPC (mock + live)             |
| `src/gcp-kms-backend.ts`     | KMS `asymmetricSign` + DER→recoverable (mock + live) |
| `src/sig-utils.ts`           | keccak256, Privy parse, DER recovery                 |
| `src/run-spike.ts`           | CLI runner                                           |
| `gcp-bootstrap-checklist.md` | Mandate-dedicated GCP project bootstrap              |

## Remote-signer HTTP contract (agent today)

`POST {signerUrl}` with `{ "sigStructure": "<base64>" }` →
`{ "signature": "<base64 65-byte recoverable>" }`.

See [ADR-0003](../../docs/adr/adr-0003-delegation-signer-backend.md) for the
proposed production contract.
