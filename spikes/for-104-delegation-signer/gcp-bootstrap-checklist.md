# GCP mandate-project bootstrap checklist (FOR-104)

Checklist for standing up a **mandate-dedicated** GCP project to host KS256
operator root keys via Cloud KMS — **independent of forest-1** infra.

Use this to score the primary FOR-104 decision criterion: effort to establish
vs Privy.

## 1. Project isolation

- [ ] Create new GCP project (e.g. `mandate-signer-dev`, `mandate-signer-prod`).
- [ ] **Do not** reuse forest-1 Terraform state, VPC, or shared service accounts.
- [ ] Link billing account; apply labels (`product=mandate`, `env=dev|prod`).
- [ ] Enable APIs: `cloudkms.googleapis.com`, `iam.googleapis.com`,
      `iamcredentials.googleapis.com` (if using WIF), `run.googleapis.com`
      (if thin signer on Cloud Run).

**Estimate:** 30–60 minutes first time (billing permissions, org policy).

## 2. KMS key (HSM secp256k1)

```sh
PROJECT=mandate-signer-dev
LOCATION=us-east1   # HSM region — pick one and keep stable
RING=mandate-operator-roots

gcloud kms keyrings create "$RING" \
  --location="$LOCATION" --project="$PROJECT"

gcloud kms keys create operator-root-1 \
  --location="$LOCATION" --keyring="$RING" \
  --purpose=asymmetric-signing \
  --default-algorithm=ec-sign-secp256k1-sha256 \
  --protection-level=hsm \
  --project="$PROJECT"
```

- [ ] Record full `cryptoKeyVersion` resource name for `GCP_KMS_KEY_NAME`.
- [ ] Export public key; derive Ethereum address (spike:
      `fetchKmsEthereumAddress` or `gcloud kms keys versions get-public-key`).
- [ ] Register that address as the log `publicRoot` / `rootSignerAddress`.

**Note:** `EC_SIGN_SECP256K1_SHA256` requires **HSM** protection level.

## 3. IAM

Create a dedicated service account for signing (not forest-1 SAs):

```sh
SA=mandate-kms-signer@${PROJECT}.iam.gserviceaccount.com

gcloud iam service-accounts create mandate-kms-signer \
  --project="$PROJECT"

gcloud kms keys add-iam-policy-binding operator-root-1 \
  --location="$LOCATION" --keyring="$RING" \
  --member="serviceAccount:${SA}" \
  --role="roles/cloudkms.signerVerifier" \
  --project="$PROJECT"
```

- [ ] Avoid downloading JSON key files for production; prefer WIF or Cloud Run
      attached SA.

## 4. Runtime credential paths (Worker compatibility)

Cloudflare Workers **do not** have Application Default Credentials. Options:

| Option                          | Worker-compat           | Ops effort             | Notes                                                           |
| ------------------------------- | ----------------------- | ---------------------- | --------------------------------------------------------------- |
| **A. Thin Cloud Run signer**    | Agent calls HTTPS       | Medium                 | SA on Cloud Run; agent holds no GCP creds. Recommended for KMS. |
| **B. WIF → short-lived token**  | Agent mints OAuth token | High                   | Custom token broker; complex for forks.                         |
| **C. SA JSON in Worker secret** | Direct KMS REST         | Low dev / **bad prod** | Anti-pattern; avoid.                                            |

**Recommendation for KMS path:** deploy a minimal **mandate-kms-signer** Cloud
Run service in the mandate GCP project implementing the remote-signer HTTP
contract; agent calls it with a shared bearer secret.

## 5. Cost (low volume, order-of-magnitude)

| Item                    | Approximate                                    |
| ----------------------- | ---------------------------------------------- |
| HSM key version         | ~$1–3 / key version / month (region-dependent) |
| asymmetricSign          | ~$0.03 / 10k ops                               |
| Cloud Run (thin signer) | Near-zero at webhook volume                    |

Privy: SaaS pricing per wallet / MAU — typically **lower fixed ops** at pilot
scale, higher vendor lock-in.

## 6. Fork-operator effort

An operator forking mandate must, for GCP path:

1. Create their own GCP project + billing.
2. Create HSM KMS key + IAM.
3. Deploy thin signer (or accept SA-key anti-pattern).
4. Wire `signerUrl` + `rootSignerAddress` in agent descriptors (FOR-100).

**Estimated fork setup:** 2–4 hours (experienced GCP) vs **~30 minutes** for
Privy (reuse existing wallet app + server wallet).

## 7. Validation

After bootstrap, run the spike live:

```sh
cd spikes/for-104-delegation-signer
export SPIKE_LIVE=1
export GCP_KMS_KEY_NAME=projects/.../cryptoKeyVersions/1
export GCP_ACCESS_TOKEN=$(gcloud auth print-access-token)
pnpm spike
```

Confirm `gcp-kms [live] PASS` and address matches registered log root.

## 8. Effort summary (for decision matrix)

| Task                        | Time (first mandate env) |
| --------------------------- | ------------------------ |
| New GCP project + APIs      | 0.5–1 h                  |
| KMS HSM key + IAM           | 0.5–1 h                  |
| Thin Cloud Run signer (PoC) | 4–8 h                    |
| CI / Doppler secrets wiring | 1–2 h                    |
| **Total GCP path**          | **~1–2 days**            |

Privy path (server wallet + auth signature wiring): **~0.5–1 day** assuming
existing Privy app from `@mandate/ui`.
