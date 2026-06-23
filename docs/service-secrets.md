# Mandate secrets catalog

**Decision record:** [ADR-0006](adr/adr-0006-privy-secrets.md). **Glossary:**
[CONTEXT.md](../CONTEXT.md) — operational secret, E2E fixture secret, Mode C user
wallet.

One env var / Wrangler binding name everywhere (Doppler, GitHub, Workers, tests,
CLI). **Hard cutover** — no legacy aliases. CI enforces via
`scripts/check-legacy-secret-names.mjs`.

## Secret taxonomy

| Prefix                   | Meaning                                                    | Doppler config    | GitHub environment                          |
| ------------------------ | ---------------------------------------------------------- | ----------------- | ------------------------------------------- |
| `MANDATE_`               | Long-lived mandate **instance** secrets                    | `dev`, `prod`     | `prod`; operational subset on `live-signer` |
| `E2E_`                   | Synthetic users, test wallets, dev Canopy/coordinator URLs | **`e2e` only**    | **`live-signer` only** — never `prod`       |
| `PUBLIC_MANDATE_PRIVY_*` | UI Privy SDK ids (public, not secret)                      | `dev`/`prod` vars | GitHub `vars` on Pages deploy               |

Never sync `E2E_*` secrets to production Workers or the `prod` GitHub environment.

## Operational secrets (`MANDATE_*`)

Doppler `mandate-forestrie` configs **`dev`** and **`prod`**.

| Name                              | Purpose                                                                                                                                         |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `MANDATE_PRIVY_APP_ID`            | Privy application id (also in signer `wrangler.env.prod.json` vars)                                                                             |
| `MANDATE_PRIVY_APP_SECRET`        | Privy app secret (Basic auth)                                                                                                                   |
| `MANDATE_PRIVY_SIGNER_ID`         | Mandate key quorum id (one per deployment)                                                                                                      |
| `MANDATE_PRIVY_AUTHORIZATION_KEY` | Mandate additional-signer P-256 key (`wallet-auth:` + base64 PKCS#8 DER); signs Privy authorization header for user-owned wallets (ADR-0003 S3) |
| `MANDATE_PRIVY_API_BASE`          | Privy API base URL (required; no code default)                                                                                                  |
| `MANDATE_SIGNER_URL`              | Deployed `@mandate/signer` `POST /v1/sign` URL (CI live tests)                                                                                  |
| `MANDATE_SIGNER_TOKEN`            | Bearer auth on signer `POST /v1/sign`                                                                                                           |
| `COORDINATOR_APP_TOKEN`           | Bearer for coordinator material submit                                                                                                          |
| `COORDINATOR_UPSTREAM_URL`        | Coordinator origin (agent var)                                                                                                                  |
| `OPERATOR_ROOT_KEYS`              | JSON map of per-log signer descriptors                                                                                                          |
| `KEY_DIRECTORY`                   | Signer wallet directory JSON                                                                                                                    |
| `CLOUDFLARE_API_TOKEN`            | Wrangler deploy / KV                                                                                                                            |
| `CLOUDFLARE_ACCOUNT_ID`           | Target Cloudflare account                                                                                                                       |
| `PUBLIC_MANDATE_PRIVY_APP_ID`     | UI client Privy app id                                                                                                                          |
| `PUBLIC_MANDATE_PRIVY_CLIENT_ID`  | UI client Privy client id                                                                                                                       |
| `PUBLIC_DEFAULT_CHAIN_ID`         | UI default chain id                                                                                                                             |

`MANDATE_PRIVY_AUTHORIZATION_KEY` is **operational**, not per-user. Real Mode C
users never store owner keys in Doppler; only the synthetic test user owner key is
`E2E_*`.

## E2E fixture secrets (`E2E_*`)

Doppler config **`e2e`** only. GitHub **`live-signer`** only.

### Privy wallet roles (E2E)

Three wallet topologies; see CONTEXT.md and ADR-0005 §7.

| Role                           | Env vars                                            | Topology                                       | Mutated by tests?                  |
| ------------------------------ | --------------------------------------------------- | ---------------------------------------------- | ---------------------------------- |
| Operator payment-authoritative | _(operational `KEY_DIRECTORY` only; not `E2E\__`)\* | Ownerless app-controlled; no additional signer | No                                 |
| Signer test wallet             | `E2E_SIGNER_TEST_*`                                 | User-owned; mandate = additional signer        | **No** — stable success path       |
| Mode C kill-switch wallet      | `E2E_MODE_C_USER_*`                                 | User-owned; mandate = additional signer        | **Yes** — onboard, revoke, restore |

The retired `mandate-forestrie` wallet (ownerless + mandate additional signer)
matched neither role and must not be referenced.

| Name                                | Synthetic role                                                      | Tests that mutate                                                 |
| ----------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `E2E_SIGNER_TEST_PRIVY_WALLET_ID`   | User-owned signer test wallet (mandate additional signer)           | `live-owned`, `live-hands-off` (success path) — **never revoked** |
| `E2E_SIGNER_TEST_WALLET_ADDRESS`    | Signer test wallet Ethereum address                                 | —                                                                 |
| `E2E_SIGNER_TEST_OWNER_AUTH_KEY`    | Owner key for signer test wallet PATCH (onboard/re-onboard only)    | Provision script / manual re-onboard                              |
| `E2E_MODE_C_USER_PRIVY_WALLET_ID`   | Mode C **kill-switch** test user wallet (distinct from signer test) | `live-mode-c`, `live-hands-off` (kill-switch), `live-provision`   |
| `E2E_MODE_C_USER_WALLET_ADDRESS`    | Optional address for Mode C wallet                                  | —                                                                 |
| `E2E_MODE_C_PRIVY_OWNER_AUTH_KEY`   | Test user owner key for wallet PATCH                                | onboard, revoke, kill-switch                                      |
| `E2E_MODE_C_PRIVY_POLICY_ID`        | Optional; reuse delegation policy across E2E jobs                   | provision, mode-c, hands-off restore                              |
| `E2E_CANOPY_API_URL`                | Dev Canopy SCRAPI base                                              | `live-provision`                                                  |
| `E2E_CANOPY_PAYMENTS_ONBOARD_TOKEN` | Onboard bearer for genesis                                          | `live-provision`                                                  |
| `E2E_CANOPY_OPS_ADMIN_TOKEN`        | Mint onboard token if payments token unset                          | `live-provision`                                                  |
| `E2E_CANOPY_UNIVOCITY_ADDR`         | Dev Univocity contract (40-hex)                                     | `live-provision`                                                  |
| `E2E_CANOPY_CHAIN_ID`               | EIP-155 chain id for dev Canopy genesis                             | `live-provision`                                                  |
| `E2E_DELEGATION_COORDINATOR_URL`    | Dev coordinator origin                                              | `live-provision`                                                  |
| `E2E_MANDATE_AGENT_WEBHOOK_URL`     | Agent webhook for genesis `?webhookUrl=`                            | `live-provision`                                                  |

Reuse `E2E_MODE_C_PRIVY_POLICY_ID` across provision, mode-c revoke-restore, and
hands-off kill-switch restore to avoid policy sprawl.

### Mode C testing context

**Mode C user wallet** (see CONTEXT.md): user's root `K(L)` in a Privy wallet they
control via owner key; mandate is additional signer only (I2). Custody is
Privy-custodied — not true BYOK (Mode B); user can revoke mandate at Privy (I3).
E2E secrets model one **synthetic test user**, not production end users.

## Worker secret catalog

Binding names match the tables above exactly.

### Shared

| Secret                  | Workers       | Purpose                             |
| ----------------------- | ------------- | ----------------------------------- |
| `CLOUDFLARE_API_TOKEN`  | CI, repo-init | Wrangler deploy and KV provisioning |
| `CLOUDFLARE_ACCOUNT_ID` | CI, repo-init | Target Cloudflare account           |
| `MANDATE_SIGNER_TOKEN`  | agent, signer | Bearer auth on `POST /v1/sign`      |

### `@mandate/agent`

| Secret / var               | Type       | Purpose                                                    |
| -------------------------- | ---------- | ---------------------------------------------------------- |
| `COORDINATOR_UPSTREAM_URL` | var        | Coordinator origin                                         |
| `COORDINATOR_APP_TOKEN`    | secret     | Bearer for material submit                                 |
| `OPERATOR_ROOT_KEYS`       | secret     | JSON map of per-log signer descriptors (ADR-0003)          |
| `REQUEST_KEYS`             | KV binding | Webhook dedup; namespace `mandate-agent-prod-request-keys` |

Prod resource ids live in gitignored `packages/apps/agent/wrangler.env.prod.json`
(from `task repo-init`). Template: `wrangler.env.prod.json.example`.

Example remote descriptor:

```json
{
	"b2c3d4e5f67890ab1234567890abcdef": {
		"alg": "KS256",
		"rootSignerAddress": "0x...",
		"kind": "remote",
		"signerUrl": "https://mandate-signer-prod.<account>.workers.dev/v1/sign",
		"keyRef": "privy-wallet-ref"
	}
}
```

### `@mandate/signer`

| Secret / var                      | Type   | Purpose                                                                                       |
| --------------------------------- | ------ | --------------------------------------------------------------------------------------------- |
| `MANDATE_PRIVY_APP_ID`            | var    | Privy application id (in gitignored `wrangler.env.prod.json`)                                 |
| `MANDATE_PRIVY_APP_SECRET`        | secret | Privy app secret                                                                              |
| `KEY_DIRECTORY`                   | secret | JSON `{ keyRef: { walletId, rootSignerAddress, logIds[], requiresAuthorizationSignature? } }` |
| `MANDATE_PRIVY_API_BASE`          | var    | Privy API base URL (required)                                                                 |
| `MANDATE_PRIVY_AUTHORIZATION_KEY` | secret | Required when any entry has `requiresAuthorizationSignature: true`                            |

Mode C `KEY_DIRECTORY` entry:

```json
{
	"user-log-wallet": {
		"walletId": "privy-wallet-id",
		"rootSignerAddress": "0x…",
		"logIds": ["b2c3d4e5f67890ab1234567890abcdef"],
		"requiresAuthorizationSignature": true
	}
}
```

### Mode C Privy policy checklist (I6, FOR-112)

1. **Owner topology (I2):** wallet `owner` is the user alone. Mandate is
   **additional signer only**.
2. **Signer policy (I6):** attach mandate override policy — one `ALLOW` for
   `secp256k1_sign`, explicit `DENY` for transfers/exports/structured signing.
3. **Authorization key:** register mandate P-256 key as
   `MANDATE_PRIVY_AUTHORIZATION_KEY` (`wallet-auth:` + base64 PKCS#8 DER).
4. **KEY_DIRECTORY:** `requiresAuthorizationSignature: true` for user `keyRef`.
5. **Kill switch (FOR-114):** user PATCH or console kill-switch.

Policy template: `buildDelegationSigningPolicy` in `@mandate/privy-admin` (see
prior commits / privy-admin source for full JSON).

Onboard CLI:

```sh
doppler run --project mandate-forestrie --config dev -- \
  doppler run --project mandate-forestrie --config e2e -- \
  pnpm --filter @mandate/register exec mandate-register privy onboard-mode-c \
  --log-id <32-hex-log-id> --key-ref user-log-wallet
```

## Doppler + GitHub sync

Project: **`mandate-forestrie`**.

| Doppler config | GitHub target             | Contents                                             |
| -------------- | ------------------------- | ---------------------------------------------------- |
| `prod`         | Environment `prod`        | Operational `MANDATE_*`, agent/signer deploy secrets |
| `dev`          | (local / repo-init)       | Same operational names as prod for dev deploy        |
| `e2e`          | Environment `live-signer` | All `E2E_*` fixture secrets                          |
| `dev`          | Environment `live-signer` | Operational `MANDATE_*` subset for CI live tests     |

Sync is **Doppler ↔ GitHub** (no push script). Ensure Doppler configs **`dev`**
and **`e2e`** are wired to GitHub environment **`live-signer`**, and **`prod`**
to **`prod`**.

### Doppler migration checklist (manual — 2FA)

1. Create Doppler config **`e2e`** on project `mandate-forestrie`.
2. Move + rename E2E secrets from `dev` → `e2e` (see rename table below).
3. Rename operational secrets in `dev`/`prod` to `MANDATE_*` /
   `PUBLIC_MANDATE_PRIVY_*`.
4. Delete old `PRIVY_*` / `CANOPY_*` keys from Doppler.
5. Configure Doppler↔GitHub sync: `e2e` + operational subset → `live-signer`;
   `prod` → `prod`.
6. Verify: `gh workflow run live-owned-wallet.yml --repo forestrie/mandate`.

### Rename reference (historical)

| Old name                                          | New name                            |
| ------------------------------------------------- | ----------------------------------- |
| `PRIVY_APP_ID`                                    | `MANDATE_PRIVY_APP_ID`              |
| `PRIVY_APP_SECRET`                                | `MANDATE_PRIVY_APP_SECRET`          |
| `PRIVY_MANDATE_SIGNER_ID`                         | `MANDATE_PRIVY_SIGNER_ID`           |
| `PRIVY_WALLET_SIGNER` / `PRIVY_AUTHORIZATION_KEY` | `MANDATE_PRIVY_AUTHORIZATION_KEY`   |
| `PRIVY_API_BASE`                                  | `MANDATE_PRIVY_API_BASE`            |
| `PUBLIC_PRIVY_APP_ID`                             | `PUBLIC_MANDATE_PRIVY_APP_ID`       |
| `PUBLIC_PRIVY_CLIENT_ID`                          | `PUBLIC_MANDATE_PRIVY_CLIENT_ID`    |
| `PRIVY_MODE_C_WALLET_ID`                          | `E2E_MODE_C_USER_PRIVY_WALLET_ID`   |
| `PRIVY_OWNER_AUTHORIZATION_KEY`                   | `E2E_MODE_C_PRIVY_OWNER_AUTH_KEY`   |
| `PRIVY_WALLET_ID`                                 | `E2E_SIGNER_TEST_PRIVY_WALLET_ID`   |
| `PRIVY_WALLET_ADDRESS`                            | `E2E_SIGNER_TEST_WALLET_ADDRESS`    |
| `PRIVY_MODE_C_WALLET_ADDRESS`                     | `E2E_MODE_C_USER_WALLET_ADDRESS`    |
| `PRIVY_DELEGATION_POLICY_ID`                      | `E2E_MODE_C_PRIVY_POLICY_ID`        |
| `CANOPY_API_URL` / `CANOPY_BASE_URL`              | `E2E_CANOPY_API_URL`                |
| `CANOPY_PAYMENTS_ONBOARD_TOKEN`                   | `E2E_CANOPY_PAYMENTS_ONBOARD_TOKEN` |
| `CANOPY_OPS_ADMIN_TOKEN`                          | `E2E_CANOPY_OPS_ADMIN_TOKEN`        |
| `CANOPY_UNIVOCITY_ADDR`                           | `E2E_CANOPY_UNIVOCITY_ADDR`         |
| `CANOPY_CHAIN_ID`                                 | `E2E_CANOPY_CHAIN_ID`               |
| `DELEGATION_COORDINATOR_URL`                      | `E2E_DELEGATION_COORDINATOR_URL`    |
| `MANDATE_AGENT_WEBHOOK_URL`                       | `E2E_MANDATE_AGENT_WEBHOOK_URL`     |

## Live test matrix

Workflow: `.github/workflows/live-owned-wallet.yml` (`workflow_dispatch`).

```mermaid
flowchart TD
  preflight[live-secrets-check]
  owned[live-owned]
  handsOff[live-hands-off]
  provision[live-provision]
  modeC[live-mode-c]
  preflight --> owned
  preflight --> provision
  owned --> handsOff
  owned --> provision
  preflight --> modeC
  provision --> modeC
```

| Job              | Primary env                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------------ |
| `live-owned`     | `MANDATE_*` + `E2E_SIGNER_TEST_*`                                                                |
| `live-hands-off` | above + `E2E_MODE_C_*`                                                                           |
| `live-provision` | `E2E_CANOPY_*`, `E2E_DELEGATION_*`, `E2E_MANDATE_AGENT_WEBHOOK_URL`, `MANDATE_*`, `E2E_MODE_C_*` |
| `live-mode-c`    | `MANDATE_*` + `E2E_MODE_C_*`                                                                     |

Local examples:

```sh
# Owned-wallet signer (stable user-owned signer test wallet)
task test:live:owned

# Agent hands-off (dev + e2e)
task test:live:hands-off

# Mode C onboarding (dev + e2e)
task test:live:mode-c

# Provision e2e
task test:live:provision

# Provision a fresh E2E_SIGNER_TEST_* wallet (ops; then set Doppler e2e)
ARCHIVE_WALLET_ID=vbd6kev61oe46vsp29hw281b task provision:e2e-signer-test-wallet
# Archive vbd6kev6 manually in Privy dashboard if API PATCH is unavailable.
```

Legacy explicit Doppler invocations:

```sh
# Owned-wallet signer
doppler run --project mandate-forestrie --config dev -- \
  pnpm --filter @mandate/signer test:live:owned

# Mode C onboarding (dev + e2e)
doppler run --project mandate-forestrie --config dev -- \
  doppler run --project mandate-forestrie --config e2e -- \
  pnpm --filter @mandate/privy-admin test:live

# Provision e2e
doppler run --project mandate-forestrie --config dev -- \
  doppler run --project mandate-forestrie --config e2e -- \
  pnpm --filter @mandate/register test:live:provision
```

### Provision e2e (FOR-100 / FOR-101)

Mint onboard token (canopy checkout):

```sh
curl -sS -X POST "$E2E_CANOPY_API_URL/api/payments/onboard-tokens" \
  -H "Authorization: Bearer $E2E_CANOPY_OPS_ADMIN_TOKEN" \
  -H "Content-Type: application/cbor" \
  --data-binary @<(node -e "const {encode}=require('cbor-x');process.stdout.write(encode(new Map([[1,'mandate-dev']])))")
```

Store token as `E2E_CANOPY_PAYMENTS_ONBOARD_TOKEN` in Doppler **`e2e`**.

```sh
doppler run --project mandate-forestrie --config dev -- \
  doppler run --project mandate-forestrie --config e2e -- \
  task provision \
  --onboard-token "$E2E_CANOPY_PAYMENTS_ONBOARD_TOKEN" \
  --canopy-url "$E2E_CANOPY_API_URL" \
  --coordinator-url "$E2E_DELEGATION_COORDINATOR_URL" \
  --webhook-url "$E2E_MANDATE_AGENT_WEBHOOK_URL" \
  --univocity-addr "$E2E_CANOPY_UNIVOCITY_ADDR" \
  --chain-id "$E2E_CANOPY_CHAIN_ID"
```

## Fork deploy checklist

1. Install `@forestrie/delegation-cose` (see ADR-0004 / README).
2. `task repo-init` with `CLOUDFLARE_*` set — creates wrangler overlays + KV.
3. Copy `.dev.vars.example` → `.dev.vars` for agent and signer.
4. Set GitHub `prod` secrets; deploy Workers (see README).
5. `wrangler secret put` per `.github/workflows/deploy-workers.yml`.
6. Set `ENABLE_WORKERS_DEPLOY=true` for CI deploy on `main`.

`repo-init` injects `PUBLIC_MANDATE_PRIVY_APP_ID` (or `MANDATE_PRIVY_APP_ID`) into
signer `wrangler.env.prod.json`.

```sh
task repo-init:doppler
# equivalent:
doppler run --project mandate-forestrie --config dev -- task repo-init
```

CI sets `CICD=true` so `repo-init` refreshes overlays from examples before deploy.
