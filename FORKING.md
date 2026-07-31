# Forking and running an independent Mandate

**Status:** DRAFT  
**Date:** 2026-06-23  
**Related:** [README.md](README.md), [ADR-0005 BYOK modes](docs/adr/adr-0005-byok-delegation-modes.md),
[ARC-021 payment onboarding](../devdocs/arc/arc-021-payment-onboarding/README.md),
[canopy SCITT hackathon demo](../canopy/docs/demo/scitt-hackathon.md)

Minimal runbook for operating a **forked mandate instance** against a Canopy
SCRAPI stack. Future demos (for example a SCITT hackathon with BYOK sealing)
will point here for **bootstrap**; participant statement flows stay in
[scitt-hackathon.md](../canopy/docs/demo/scitt-hackathon.md).

Diagrams below show **who does what** — operator actions, user actions, and
hand-offs between parties. They omit internal worker/DO behaviour.

---

## Bootstrap overview

```mermaid
sequenceDiagram
    participant M as Mandate operator
    participant C as Canopy operator
    participant U as End user

    Note over M,C: 1. On-chain anchor + credentials
    M->>C: Request chainId + Univocity address (or deploy yourself)
    C-->>M: Chain binding
    M->>C: Request onboard token for your instance
    C-->>M: Onboard bearer (shown once)

    Note over M: 2. Mandate instance
    M->>M: Privy app + operator wallet + Cloudflare deploy

    Note over M: 3. Payment-authoritative log
    M->>M: Run provision → genesis + webhook
    M->>M: Register root grant → warm log

    Note over M,U: 4. First user log
    U->>U: Create or connect wallet
    M->>M: Onboard mandate on user wallet + user grant

    Note over M: 5. Proof
    M->>M: Register a statement → poll → download receipt
```

Mandate is the **operator console and sealing plane** for BYOK user logs. Canopy
is the **transparency pipe**. You need both, plus an onboard token from whoever
runs the Canopy ops plane.

---

## Prerequisites

| Item                            | Notes                                                                                        |
| ------------------------------- | -------------------------------------------------------------------------------------------- |
| Git fork of `forestrie/mandate` | `pnpm install` (tokenless; `@forestrie/delegation-cose` resolves from public npmjs, FOR-336) |
| Cloudflare account              | Pages (`@mandate/ui`) + Workers (agent, signer)                                              |
| Privy app                       | Dashboard app id + secret; embedded Ethereum wallets enabled                                 |
| Canopy SCRAPI base URL          | e.g. `https://api-a.forest-2.forestrie.dev` or your self-hosted worker                       |
| Delegation-coordinator URL      | e.g. `https://delegation-coordinator.a.forest-2.forestrie.dev`                               |
| Chain + Univocity address       | 20-byte contract address bound at genesis                                                    |
| Onboard bearer token            | From Canopy operator (below) — gates **payment-authoritative** genesis                       |

Optional for local dev: [Doppler](https://www.doppler.com/) project `mandate-forestrie`
config `dev`, or copy `.dev.vars.example` files under `packages/apps/*`.

---

## 1 — Deploy Univocity (on-chain anchor)

Genesis binds your forest to a **chain id** and **contract address**. Choose one
path:

```mermaid
sequenceDiagram
    participant M as Mandate operator
    participant C as Canopy operator
    participant Rel as Univocity releases
    participant Chain as Target chain

    alt A — Reuse existing deployment (fastest)
        M->>C: Ask for chainId + contract address on their lane
        C-->>M: chainId, univocityAddr
    else B — Deploy from official release (independent fork)
        M->>Rel: Download deployer binary for release tag
        M->>M: deploy imutable --from-release (downloads + verifies manifest)
        M->>Chain: Sign deploy transaction
        Chain-->>M: Deployed contract address
    else C — Build from univocity source
        M->>M: Clone repo, configure secrets, run deploy scripts
        M->>Chain: Sign deploy transaction(s)
        Chain-->>M: Deployed contract address
    else D — Ephemeral dev only
        M->>M: Run canopy e2e preflight (throwaway contract)
    end
    M->>M: Record chainId + address for genesis
```

| Path   | When to use                                                                                                                               |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **A**  | Fork on a shared Forestrie dev lane                                                                                                       |
| **B**  | Independent fork; prebuilt deployer + release tag — no Foundry — see [releases](https://github.com/forestrie/univocity/releases)          |
| **B′** | Same as **B** but in the browser — [univocity-deploy](https://univocity-deploy.pages.dev) (EOA only; manifest + sidecar verified in-page) |
| **B″** | Safe 1x1 (Mode D) forks: inline in the mandate console's `/onboard` wizard — propose + execute with the owner wallet, no CLI              |
| **C**  | Custom contract changes                                                                                                                   |
| **D**  | Local smoke only — not production                                                                                                         |

**B (detail):** download `deployer-darwin-arm64` or `deployer-linux-x64` from
the [univocity-tools v0.6.0 release](https://github.com/forestrie/univocity-tools/releases/tag/v0.6.0)
(or a newer tag), verify the `.sha256` sidecar, then run one-shot EOA deploy:

```shell
./deployer-darwin-arm64 deploy imutable \
  --from-release v0.1.4 \
  --bootstrap-alg ks256 \
  --bootstrap-ks256-signer 0xYourBootstrapSigner \
  --deploy-key "$DEPLOY_KEY" \
  --rpc-url "$RPC_URL"
```

For ES256 bootstrap, add `--bootstrap-alg es256` and
`--bootstrap-es256-pem "$BOOTSTRAP_PEM_ES256"`.

The command fetches `deploy-manifest-<tag>.json` from the
[Univocity release](https://github.com/forestrie/univocity/releases) when present
(preferred), otherwise the `univocity-<tag>.tar.gz` build archive. Foundry is
not required on the operator machine.

For Safe multisig deploys, use `deploy propose imutable` / `deploy approve` with
`--release-root` or `--from-manifest` (pass `--manifest-sidecar` with the local
`.sha256` file when using a downloaded manifest); see
[univocity-tools CLI docs](https://github.com/forestrie/univocity-tools/blob/main/docs/agents/cli.md).

**B′ (browser):** open [univocity-deploy](https://univocity-deploy.pages.dev),
connect a wallet (Privy or injected MetaMask), select **Base Sepolia (84532)** —
the app switches the wallet off Ethereum mainnet automatically — verify
`deploy-manifest-<tag>.json` and its `.sha256` sidecar (fetched from GitHub or
drag-dropped offline), deploy **ImutableUnivocity** via EOA, then download
`{ chainId, univocityAddr, bootstrapAlg }` for Step 2 below. Integrity model
matches CLI Path B
([ADR-0010](https://github.com/forestrie/univocity-tools/blob/main/docs/adr/adr-0010-deploy-manifest-format.md)).

**B″ (mandate console, Safe 1x1 / Mode D):** in the `/onboard` wizard choose
**Deploy one now** — the console fetches the release manifest via its own
byte proxy, verifies manifest + sidecar **in-page** (same ADR-0010 integrity
model as B′), predicts the deterministic CREATE2 address for your validated
Safe, then signs one SafeTx with the owner wallet. Execute it inline from the
console (`execTransaction` from the owner) or from the Safe app queue — the
wizard watches the predicted address and continues into onboarding
automatically. Proposal to the Safe Transaction Service is best-effort;
execution never depends on it (ADR-0060, devdocs).

**C (opt-in — counterfactual UUPS):** for predict-before-deploy and deterministic
multi-forest anchors, use the Univocity deployer CLI **UUPS** path. Imutable
paths **B / B′** above remain the **default, highest-assurance** choice.

```shell
# Predict address before deploy (mint a logId or pass --log-id)
deployer deploy uups predict \
  --from-release v0.6.0 \
  --log-id "$FOREST_LOG_ID" \
  --deploy-key "$DEPLOY_KEY"

# Deploy to the predicted address; KS256 defaults upgradeAdmin to bootstrap signer
deployer deploy uups \
  --from-release v0.6.0 \
  --log-id "$FOREST_LOG_ID" \
  --bootstrap-alg ks256 \
  --bootstrap-ks256-signer 0xYourBootstrapSigner \
  --deploy-key "$DEPLOY_KEY" \
  --rpc-url "$RPC_URL" \
  --deployment-manifest-out ./uups-manifest.json

# Trust-check before canopy genesis
deployer deploy uups verify \
  --deployment-manifest ./uups-manifest.json \
  --from-manifest ./deploy-manifest-v0.6.0.json \
  --rpc-url "$RPC_URL"
```

Omit `--log-id` to mint a fresh forest logId (reported on stdout). ES256
bootstrap requires explicit `--upgrade-admin` (no EOA default). Use
`--proxy-salt` only for legacy fixed-salt deploys (`…/UUPSUnivocity/0`).

Record `chainId`, `univocityAddr` (= manifest `proxy`), `logId`, and
`deployer` from the post-deploy manifest for Steps 2 and genesis (canopy
re-derives the address from logId + deployer).

**Provision (Mode B path C):** after deploy, pass counterfactual genesis labels
via `mandate-register provision`:

```shell
mandate-register provision --mode B \
  --onboard-token "$ONBOARD_TOKEN" \
  --canopy-url "$E2E_CANOPY_API_URL" \
  --coordinator-url "$E2E_DELEGATION_COORDINATOR_URL" \
  --webhook-url "$E2E_MANDATE_AGENT_WEBHOOK_URL" \
  --univocity-addr "$PROXY" \
  --chain-id "$CHAIN_ID" \
  --forest-r "$FOREST_LOG_ID" \
  --univocity-variant uups-counterfactual \
  --univocity-deployer "$DEPLOYER" \
  --root-address "$USER_ROOT" \
  --user-signer-url "$USER_SIGNER_URL" \
  --key-ref "$KEY_REF"
```

`--forest-r` must match the logId used at deploy time (canopy binds genesis
`-68010` from the path segment).

---

## 2 — Request an onboard token

Payment-authoritative genesis requires a **minted onboard bearer** from the Canopy
registration control plane.

### Self-service (recommended)

After step 1, submit an **onboard request** with your deployed Univocity binding.
The request carries a **bootstrap-key attestation** (ADR-0059 D8): a CWT signed
by the chain-declared bootstrap key, proving the requester controls the
instance being registered. Where the canopy lane arms
`ONBOARD_REQUIRE_KEY_ATTESTATION`, an unattested request is rejected. The CLI
signs it through the remote mandate signer (`--root-address`, `--log-id`, and
`--signer-url`/`MANDATE_SIGNER_URL` + `MANDATE_SIGNER_TOKEN`); omit those flags
only on lanes that do not require attestation. The canopy operator approves
(or dev lane auto-approves); you **redeem** with the one-time code to receive
the bearer.

```mermaid
sequenceDiagram
    participant M as Mandate operator
    participant API as canopy-api
    participant C as Canopy operator

    M->>API: POST /api/onboarding/requests
    API-->>M: requestId + redeemCode
    C->>API: POST approve (ops)
    M->>API: POST redeem
    API-->>M: CANOPY_PAYMENTS_ONBOARD_TOKEN once
    M->>M: Store in secrets manager
```

```bash
# Request
mandate-register onboard request \
  --canopy-url "$CANOPY_BASE_URL" \
  --label "your-mandate-prod" \
  --chain-id "$CHAIN_ID" \
  --univocity-addr "$UNIVOCITY_ADDR" \
  --contact-email "you@example.com" \
  --root-address "$ROOT_WALLET_ADDR" \
  --log-id "$LOG_ID_HEX32" \
  --signer-url "$MANDATE_SIGNER_URL"   # bearer via MANDATE_SIGNER_TOKEN env

# Poll until approved
mandate-register onboard status --canopy-url "$CANOPY_BASE_URL" --request-id "$REQUEST_ID"

# Redeem
mandate-register onboard redeem \
  --canopy-url "$CANOPY_BASE_URL" \
  --request-id "$REQUEST_ID" \
  --redeem-code "$REDEEM_CODE"
```

See [ARC-021.7](../devdocs/arc/arc-021-payment-onboarding/07-self-service-onboard-request.md).

### Break-glass (ops mint)

If you operate canopy yourself or need a manual path:

```bash
curl -sS -X POST "$CANOPY_BASE_URL/api/payments/onboard-tokens" \
  -H "Authorization: Bearer $CANOPY_OPS_ADMIN_TOKEN" \
  -H "Content-Type: application/cbor" \
  --data-binary @<(node -e "const {encode}=require('cbor-x');process.stdout.write(encode(new Map([[1,'your-label']])))")
```

---

## 3 — Deploy mandate Workers and UI

Human setup in Privy and Cloudflare before any forest registration.

```mermaid
sequenceDiagram
    participant M as Mandate operator
    participant Privy as Privy dashboard
    participant CF as Cloudflare dashboard

    M->>Privy: Create app (embedded Ethereum wallets)
    M->>Privy: Create key quorum + additional-signer P-256 key
    M->>Privy: Create ownerless operator wallet<br/>(payment-authoritative root — ADR-0005 §7)
    M->>CF: repo-init → deploy agent + signer Workers
    M->>CF: Deploy Pages UI + public Privy vars
    M->>CF: Set Worker secrets<br/>(signer token, coordinator token, KEY_DIRECTORY, …)
    M->>M: Note agent webhook URL for step 4
```

Full secret catalog: [service-secrets.md](docs/service-secrets.md). Deploy
detail: [README.md](README.md).

---

## 4 — Register the operator payment-authoritative log

Creates forest root **`R`**, binds Univocity, and registers your agent webhook
with the delegation-coordinator.

```mermaid
sequenceDiagram
    participant M as Mandate operator
    participant CLI as mandate-register CLI
    participant Canopy as Canopy SCRAPI

    M->>CLI: task provision<br/>(onboard token, URLs, chain binding, webhook URL)
    CLI->>Canopy: POST payment-authoritative genesis
    Canopy-->>M: forestR, logId, coordinator status
    M->>M: Paste descriptor output into agent/signer secrets

    M->>Canopy: POST /register/{R}/grants<br/>(root creation Forestrie-Grant)
    loop Until grant receipt ready
        M->>Canopy: Poll status URL
        Canopy-->>M: Redirect toward receipt
    end
    Note over M: PA log warm — can accept statements
```

### CLI example

**Production:** use the **ownerless app-controlled** operator wallet from step 3
as genesis `bootstrapKey`. The default **Mode C** provision path is a dev/CI
shortcut (user-owned wallet); see [ADR-0005 §7](docs/adr/adr-0005-byok-delegation-modes.md).

```bash
doppler run --project mandate-forestrie --config dev -- \
  task provision \
  --onboard-token "$CANOPY_PAYMENTS_ONBOARD_TOKEN" \
  --canopy-url "$CANOPY_API_URL" \
  --coordinator-url "$DELEGATION_COORDINATOR_URL" \
  --webhook-url "$MANDATE_AGENT_WEBHOOK_URL" \
  --univocity-addr "$CANOPY_UNIVOCITY_ADDR" \
  --chain-id "$CANOPY_CHAIN_ID"
```

| Output field          | Keep                                               |
| --------------------- | -------------------------------------------------- |
| `forestR`             | Bootstrap UUID `R` for SCRAPI paths                |
| `logIdHex32`          | Coordinator / grant log id                         |
| `descriptors`         | `KEY_DIRECTORY` + `OPERATOR_ROOT_KEYS` for Workers |
| `genesis.coordinator` | Expect `publicRoot: ok`, `webhook: ok`             |

Warm-log grant flow matches
[scitt-hackathon Appendix B](../canopy/docs/demo/scitt-hackathon.md#appendix-b--organizer-setup-not-the-main-show).

---

## 5 — Register the first user log

Each user log has its own `logId` and root key `K(L)`. Choose one delegation
mode per user log:

| Mode  | Typical use                        | Where `K(L)` lives      | Mandate sealing path                           |
| ----- | ---------------------------------- | ----------------------- | ---------------------------------------------- |
| **C** | Hosted sealing (default fork path) | User-owned Privy wallet | `@mandate/signer` via `MANDATE_SIGNER_TOKEN`   |
| **B** | Purist BYOK (reference fork path)  | User signer / HSM only  | User `signerUrl` via `bearerEnvKey` env bearer |

**§5a** below is Mode C. **§5b** is Mode B — see
[ADR-0005](docs/adr/adr-0005-byok-delegation-modes.md) and
[CONTEXT.md](CONTEXT.md) (Mode B descriptor, user remote signer).

### 5a — Mode C (hosted sealing)

```mermaid
sequenceDiagram
    participant U as End user
    participant M as Mandate operator
    participant Privy as Privy
    participant Canopy as Canopy SCRAPI
    participant UI as Mandate UI

    U->>Privy: Create or connect user-owned wallet
    M->>M: Assign logId for this user
    M->>M: privy onboard-mode-c<br/>(wallet, logId, signer URL)
    M->>M: Merge CLI output into Worker secrets

    M->>Canopy: Register grant binding user statement signer
    loop Until completed Forestrie-Grant
        M->>Canopy: Poll grant status
        Canopy-->>M: Receipt ready
    end

    U->>UI: Log in, connect wallet, open /delegations
    Note over U,UI: Pending delegation work appears<br/>when checkpoints require sealing
```

```bash
doppler run --project mandate-forestrie --config dev -- \
  task privy:onboard:mode-c -- \
  --log-id "<user-log-hex32>" \
  --wallet-id "<privy-wallet-id>" \
  --signer-url "$MANDATE_SIGNER_URL"
```

Mode C adds a `KEY_DIRECTORY` entry on `@mandate/signer` and points
`OPERATOR_ROOT_KEYS.signerUrl` at `MANDATE_SIGNER_URL`. Mandate holds Privy
credentials for signing only — not the user's root private key.

**Separate regular forest per customer:** endorse on `R` with `GF_DERIVED`, then
genesis `R'` ([ARC-021.3](../devdocs/arc/arc-021-payment-onboarding/03-phase-b-regular-forest.md)).
Many forks issue **child grants under the same `R`** instead.

### 5b — Mode B user log (purist BYOK)

Mode B is **agnostic to how the Univocity root was deployed** in §1 — Imutable
(paths **B / B′**, default) or opt-in counterfactual UUPS (path **C**). Use the
same `--univocity-addr` and `--chain-id` from your deploy manifest when requesting
onboard tokens and provisioning.

In Mode B the user (or their security team) holds `K(L)` in a signer they operate.
Mandate **never** stores the root private key and **does not** add a
`KEY_DIRECTORY` entry for that log. The agent routes delegation signing to the
user's `POST /v1/sign` endpoint with a **separate bearer** (`USER_SIGNER_BEARER`),
not `MANDATE_SIGNER_TOKEN`.

Reference implementation:
[`@mandate/reference-user-signer`](packages/apps/reference-user-signer/README.md)
(FOR-209). Production users may run their own HSM/KMS bridge implementing the same
[ADR-0003](docs/adr/adr-0003-delegation-signer-backend.md) contract.

```mermaid
sequenceDiagram
    participant U as User / security team
    participant M as Mandate operator
    participant US as User remote signer
    participant Agent as @mandate/agent
    participant Canopy as Canopy SCRAPI

    U->>U: Generate or import KS256 root K(L)
    U->>US: Deploy signer (reference-user-signer or HSM bridge)
    U->>M: Share rootSignerAddress, signerUrl, keyRef, bearer token

    M->>M: task provision:mode-b<br/>(--mode B, user-signer-url, root-address)
    M->>M: Set agent OPERATOR_ROOT_KEYS + USER_SIGNER_BEARER<br/>(no KEY_DIRECTORY for this log)

    M->>Canopy: Register grant with user statement signer
    loop Until completed Forestrie-Grant
        M->>Canopy: Poll grant status
        Canopy-->>M: Receipt ready
    end

    Note over Canopy,Agent: Checkpoint needs delegation
    Canopy->>Agent: delegation.required webhook
    Agent->>US: POST /v1/sign<br/>Authorization: Bearer USER_SIGNER_BEARER
    US-->>Agent: 65-byte KS256 signature
    Agent->>Canopy: Submit delegation certificate
```

#### Reader FAQ (Mode B)

| Question                                   | Answer                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D1 — Where is my root key?**             | Only in the user-operated signer (`USER_SIGNER_KEYS_JSON` on the reference Worker, or your KMS). Mandate Workers hold descriptors and bearer tokens, not `K(L)`.                                                                                                                                                 |
| **D2 — What does mandate-signer do?**      | Nothing for this user log. `signerUrl` must **not** be `MANDATE_SIGNER_URL`. `@mandate/signer` remains for Mode C logs and the operator PA wallet only.                                                                                                                                                          |
| **D3 — Same key after Mode C revoke?**     | Yes — [ADR-0005 exit step 3](docs/adr/adr-0005-byok-delegation-modes.md#operational-appendix--mode-c-kill-switch-and-exits-for-114): revoke mandate at Privy, point `OPERATOR_ROOT_KEYS.signerUrl` at the user's signer, set `bearerEnvKey: USER_SIGNER_BEARER`. `publicRoot` is unchanged — no re-registration. |
| **D4 — Which bearer does the agent send?** | The env named by `bearerEnvKey` on the descriptor (default `USER_SIGNER_BEARER`). It must match the user signer's bearer. Empty env → agent fails closed (no fallback to `MANDATE_SIGNER_TOKEN`).                                                                                                                |

#### Mode B vs Mode C — what mandate never holds (user log)

| Secret / config                    | Mode C (hosted)                 | Mode B (purist BYOK)                      |
| ---------------------------------- | ------------------------------- | ----------------------------------------- |
| User root private key              | Never (Privy TEE)               | **Never** (user signer only)              |
| `KEY_DIRECTORY` entry for user log | Yes (`walletId`, auth key path) | **No** — empty `{}` from Mode B provision |
| `OPERATOR_ROOT_KEYS.signerUrl`     | `MANDATE_SIGNER_URL`            | User `signerUrl` (≠ mandate-signer)       |
| Agent bearer for remote sign       | `MANDATE_SIGNER_TOKEN`          | `USER_SIGNER_BEARER` via `bearerEnvKey`   |
| Privy additional-signer policy     | Required                        | Not used for this log                     |

#### Deploy reference user signer

```bash
# Doppler dev: USER_SIGNER_BEARER + USER_SIGNER_KEYS_JSON
task deploy:reference-user-signer
# Record deployed URL as E2E_USER_SIGNER_URL (e2e) or operator secret
```

See [packages/apps/reference-user-signer/README.md](packages/apps/reference-user-signer/README.md).

#### Provision Mode B user log

Use the user's `rootSignerAddress` as genesis `bootstrapKey`. Align `forest-r`
(or the generated `logIdHex32`) with the log id in `USER_SIGNER_KEYS_JSON`.

```bash
doppler run --project mandate-forestrie --config dev -- \
  doppler run --project mandate-forestrie --config e2e -- \
  task provision:mode-b -- \
  --onboard-token "$CANOPY_PAYMENTS_ONBOARD_TOKEN" \
  --canopy-url "$CANOPY_API_URL" \
  --coordinator-url "$DELEGATION_COORDINATOR_URL" \
  --webhook-url "$MANDATE_AGENT_WEBHOOK_URL" \
  --univocity-addr "$CANOPY_UNIVOCITY_ADDR" \
  --chain-id "$CANOPY_CHAIN_ID" \
  --root-address "0x<UserKs256RootAddress>" \
  --user-signer-url "$USER_SIGNER_URL" \
  --key-ref "user-remote" \
  --forest-r "<dashed-uuid-matching-signer-keys-json-log-id>"
```

Expect provision output:

| Field                                              | Mode B expectation                       |
| -------------------------------------------------- | ---------------------------------------- |
| `descriptors.keyDirectory`                         | `{}`                                     |
| `descriptors.operatorRootKeys[logId].signerUrl`    | User signer URL (≠ `MANDATE_SIGNER_URL`) |
| `descriptors.operatorRootKeys[logId].bearerEnvKey` | `USER_SIGNER_BEARER`                     |

Merge into agent Worker secrets:

- `OPERATOR_ROOT_KEYS` — JSON from provision (or append per-log entry)
- `USER_SIGNER_BEARER` — same bearer the user signer expects
- Do **not** add a user-log row to signer `KEY_DIRECTORY`

Example descriptor (one log):

```json
{
	"a1b2c3d4e5f678901234567890abcdef0": {
		"alg": "KS256",
		"rootSignerAddress": "0x…",
		"kind": "remote",
		"signerUrl": "https://mandate-reference-user-signer.<account>.workers.dev/v1/sign",
		"keyRef": "user-remote",
		"bearerEnvKey": "USER_SIGNER_BEARER"
	}
}
```

#### Grant registration and sealing

After provision, register the user's statement-signing grant on Canopy (same
shape as §5a). When checkpoints require delegation, the coordinator webhook
hits `@mandate/agent`, which POSTs to the **user signer URL** with
`USER_SIGNER_BEARER`. Live verification: `task test:live:mode-b` (FOR-210).

#### Exit from Mode C to Mode B (same key)

After [Privy revoke](docs/service-secrets.md#post-revoke-secret-hygiene-for-131)
(ADR-0005 exit step 2), an operator may switch the log to Mode B without
re-registering grants:

1. Deploy or expose the user's `POST /v1/sign` endpoint.
2. Update `OPERATOR_ROOT_KEYS` for that `logId`: `signerUrl` → user URL,
   `bearerEnvKey: USER_SIGNER_BEARER`, remove Mode C `keyRef` mapping to Privy.
3. Set agent `USER_SIGNER_BEARER`; prune the Mode C `KEY_DIRECTORY` entry on
   `@mandate/signer` if no other log uses it.
4. Confirm sealing via webhook (or `task test:live:mode-b` in CI).

Thin agent index: [docs/agents/mode-b-fork.md](docs/agents/mode-b-fork.md).

### 5c — Demo / system-test: burner signing (no Privy)

The default `@mandate/ui` wallet is **Privy**, which is itself custodial — so it
is a poor vehicle for _demonstrating_ the very "own your keys, exit with zero
friction" property Mode C→B relies on. For demos and system tests, serve the UI
with a **browser-local burner key** the user fully controls instead
([plan-2607-01](docs/plans/plan-2607-01-browser-burner-signer-backend.md),
FOR-322).

- **Select it at deploy time:** `PUBLIC_MANDATE_SIGNER_BACKEND=burner` (blank/unset
  ⇒ `privy`; **never set `burner` for the live instance**). The delegation console
  then shows a **Burner wallet** card (create / export / clear, flagged "for demo
  purposes") and signs both the delegation certificate and the coordinator
  control-plane challenge with the local key — no Privy at all.
- **Onboard against it:** the burner address is the log's `K(L)` — pass it as the
  genesis `bootstrapKey` / `--root-address` exactly like a Mode B user signer.
  Canopy is custody-agnostic (ADR-0005 §7), so nothing downstream changes.
- **Pre-populate for system tests:** seed `localStorage['mandate.burner.privateKey']`
  before load (Playwright `addInitScript` via `seedBurnerKey()` in
  `@forestrie/mandate-ui-e2e-kit`) so the operator starts already holding the key
  and the exit gradient runs non-interactively. Hermetic spec + config:
  `packages/tests/ui-e2e` → `task test:e2e:ui:burner`.

This is the crispest way to show the Mode C→B claim end to end: the same key
signs, revokes hosted access, and moves to another operator with **no
re-registration** (`publicRoot` unchanged, ARC-0022 I5). Once the burner path is
proven, the Privy integration no longer needs to be exercised to demonstrate the
BYOK/exit properties — swap in any wallet that can sign KS256.

---

## 6 — Prove the setup: register a statement (SCRAPI)

Confirms Canopy accepts grants and produces receipts. Same participant shape as
[scitt-hackathon Part 1](../canopy/docs/demo/scitt-hackathon.md#part-1--participant-flow).

```mermaid
sequenceDiagram
    participant M as Mandate operator
    participant Canopy as Canopy SCRAPI

    M->>Canopy: GET /api/health + /.well-known/scitt-configuration
    M->>M: Sign statement document (COSE Sign1)
    M->>Canopy: POST /register/{R}/entries<br/>Authorization: Forestrie-Grant
    Canopy-->>M: 303 → status URL

    loop Until receipt (typically 30–90s)
        M->>Canopy: GET status URL
        Canopy-->>M: 303 pending or receipt URL
    end

    M->>Canopy: GET receipt
    Note over M: Transparency path verified.<br/>Delegation sealing is a separate checkpoint step.
```

### Commands

```bash
export CANOPY_BASE_URL="https://api.example.com"
export BOOTSTRAP_LOG_ID="<forestR from step 4>"
export COMPLETED_GRANT_B64="<base64 Forestrie-Grant>"

curl -sS "$CANOPY_BASE_URL/api/health" | jq .
curl -sS "$CANOPY_BASE_URL/.well-known/scitt-configuration" | jq .

curl -sS -D headers.txt -o /dev/null -X POST \
  "$CANOPY_BASE_URL/register/$BOOTSTRAP_LOG_ID/entries" \
  -H "Authorization: Forestrie-Grant $COMPLETED_GRANT_B64" \
  -H 'Content-Type: application/cose; cose-type="cose-sign1"' \
  --data-binary @statement.cose
```

Poll for receipt (expect **303** chain ending in `/receipt`):

```bash
STATUS_URL="$(grep -i '^location:' headers.txt | cut -d' ' -f2- | tr -d '\r')"
case "$STATUS_URL" in http*) ;; *) STATUS_URL="$CANOPY_BASE_URL$STATUS_URL" ;; esac

while true; do
  curl -sS -D poll-headers.txt -o /dev/null "$STATUS_URL"
  LOC="$(grep -i '^location:' poll-headers.txt | cut -d' ' -f2- | tr -d '\r')"
  echo "$(date -u +%H:%M:%S) → $LOC"
  case "$LOC" in */receipt) RECEIPT_URL="$LOC"; break ;; esac
  sleep 2
done

case "$RECEIPT_URL" in http*) ;; *) RECEIPT_URL="$CANOPY_BASE_URL$RECEIPT_URL" ;; esac
curl -sS "$RECEIPT_URL" -o receipt.cbor
```

### Optional — delegation round-trip

```mermaid
sequenceDiagram
    participant U as End user
    participant M as Mandate operator
    participant UI as Mandate UI

    Note over M: Wait for checkpoint needing delegation
    M->>UI: Check /delegations pending queue
    Note over M: Agent receives webhook, signs, submits material
    M->>UI: Confirm pending entry cleared
    U->>UI: Optional — pause/resume via kill switch
```

---

## Credential cheat sheet

| Credential                      | Who holds it         | Gates                                                                       |
| ------------------------------- | -------------------- | --------------------------------------------------------------------------- |
| `CANOPY_OPS_ADMIN_TOKEN`        | Canopy operator      | Mint onboard tokens                                                         |
| `CANOPY_PAYMENTS_ONBOARD_TOKEN` | Mandate operator     | PA genesis only                                                             |
| `Forestrie-Grant`               | User / operator keys | Grants + statements                                                         |
| `COORDINATOR_APP_TOKEN`         | Mandate infra        | Coordinator service APIs                                                    |
| Control-plane session           | User wallet          | Coordinator UX APIs (v1) — [ADR-0001](docs/adr-0001-auth-strategy-seams.md) |

---

## Troubleshooting

| Symptom                         | Check                                         |
| ------------------------------- | --------------------------------------------- |
| Genesis 401                     | Onboard token wrong or revoked                |
| Genesis 503 coordinator         | Webhook URL unreachable from Canopy           |
| Statement 403 `signer_mismatch` | Statement signer ≠ grant binding              |
| Receipt poll never completes    | Ask Canopy operator: Ranger + Sealer health   |
| Agent never seals               | Webhook URL, Worker secrets, log enabled flag |

---

## Further reading

- [README.md](README.md) — monorepo dev, CI, Workers deploy
- [CONTEXT.md](CONTEXT.md) — mandate glossary
- [canopy grants.md](../canopy/docs/grants.md) — grant shapes and register rules
- [ARC-021 end-to-end](../devdocs/arc/arc-021-payment-onboarding/06-end-to-end.md) — registration control plane
- [scitt-hackathon.md](../canopy/docs/demo/scitt-hackathon.md) — participant SCRAPI demo
- [docs/agents/mode-b-fork.md](docs/agents/mode-b-fork.md) — Mode B agent index (→ §5b)
