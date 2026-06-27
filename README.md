# Mandate

BYOK Univocity instance management for Forestrie — operator console, delegation
agent, and registration provisioner. The **operator console** (`@mandate/ui`) is a
SvelteKit app that talks to the
[delegation coordinator](https://github.com/forestrie/canopy) through a same-origin
BFF; private keys stay in the browser via [Privy](https://privy.io).

**Forking a mandate instance:** [FORKING.md](FORKING.md) — Mode C hosted sealing
(§5a) and Mode B purist BYOK (§5b).

## Monorepo layout

```text
packages/
  apps/
    ui/        @mandate/ui — operator console (Cloudflare Pages)
    agent/     @mandate/agent — webhook receiver + signer (Worker, FOR-98)
    signer/    @mandate/signer — Privy remote signer (Worker, ADR-0003)
    reference-user-signer/  @mandate/reference-user-signer — dev/e2e Mode B reference signer only (FOR-209)
    register/  @mandate/register — instance provisioning (FOR-100)
  libs/
    coordinator-types/  shared coordinator API types (@mandate/coordinator-types)
    privy-admin/        Mode C Privy onboarding helpers (@mandate/privy-admin)
    signer-contract/    ADR-0003 SignRequest/SignResponse (@mandate/signer-contract)
```

See [docs/plans/plan-0003-for-97-package-split.md](docs/plans/plan-0003-for-97-package-split.md).

## Stack

- pnpm workspace
- SvelteKit 2 + Svelte 5 (`@mandate/ui`)
- Cloudflare Pages (`@sveltejs/adapter-cloudflare`)
- Privy (`@privy-io/js-sdk-core`, client-only)
- Tailwind CSS v4 + lightweight UI primitives

## Local development

1. Copy env templates in `packages/apps/ui/`:

   ```sh
   cp packages/apps/ui/.env.example packages/apps/ui/.env
   cp packages/apps/ui/.dev.vars.example packages/apps/ui/.dev.vars
   ```

2. Fill in Privy app IDs (public) and coordinator secrets in `.dev.vars`:
   - `COORDINATOR_APP_TOKEN`
   - `COORDINATOR_UPSTREAM_URL` (default: `https://coordinator.forest-2.forestrie.dev`)

3. Run with Doppler (recommended):

   ```sh
   task dev:doppler
   ```

   Or plain Vite after hydrating env files:

   ```sh
   pnpm dev
   ```

## Scripts (repo root)

| Command                       | Purpose                                      |
| ----------------------------- | -------------------------------------------- |
| `pnpm dev`                    | Vite dev server (`@mandate/ui`)              |
| `pnpm build`                  | Build all workspace packages                 |
| `pnpm build:ui`               | Cloudflare Pages build for ui only           |
| `pnpm check`                  | Typecheck all packages                       |
| `pnpm test`                   | Vitest across workspace                      |
| `pnpm lint`                   | Prettier + ESLint + legacy secret name check |
| `pnpm sync:coordinator-types` | Copy types from sibling `canopy` checkout    |
| `pnpm audit:client-secrets`   | Ensure server secrets are not in ui bundle   |

### Task commands (`task`)

Requires [go-task](https://taskfile.dev). Doppler project defaults to
`mandate-forestrie` / config `dev` (see `Taskfile.dist.yml`).

| Task                                | Purpose                                                                                  |
| ----------------------------------- | ---------------------------------------------------------------------------------------- |
| `task dev:doppler`                  | UI dev server with Doppler `dev` secrets                                                 |
| `task repo-init:doppler`            | Provision KV + `wrangler.env.prod.json` overlays                                         |
| `task test:live:owned`              | Signer owned-wallet live test (`dev` + `e2e`)                                            |
| `task test:live:hands-off`          | Agent hands-off sealing live test                                                        |
| `task test:live:mode-c`             | Mode C onboard + revoke live test                                                        |
| `task test:live:provision`          | Provision + genesis live e2e                                                             |
| `task test:live:mode-b`             | Mode B reference user signer live test                                                   |
| `task deploy:reference-user-signer` | Deploy Mode B reference user signer Worker                                               |
| `task privy:onboard:mode-c`         | Attach mandate additional signer to a user wallet                                        |
| `task privy:revoke:mode-c`          | Mode C kill switch (owner-signed PATCH)                                                  |
| `task provision`                    | `mandate-register provision` (`dev` + `e2e`)                                             |
| `task provision:mode-b`             | Mode B user log provision ([FORKING.md §5b](FORKING.md#5b--mode-b-user-log-purist-byok)) |

Live tests that touch Privy or Canopy fixtures use **nested Doppler**:
`doppler run --config dev -- doppler run --config e2e -- …` (wrapped by the
`task test:live:*` commands above).

## Architecture

```text
Browser (Privy wallet)
  → Mandate Pages Functions (/api/coordinator/* BFF)
  → delegation-coordinator (coordinator.{DNS_SUB}.{DNS_APEX})
```

Auth modes are pluggable — v1 uses `app_token_bff` (server holds `COORDINATOR_APP_TOKEN`).
See [docs/adr-0001-auth-strategy-seams.md](docs/adr-0001-auth-strategy-seams.md).

## Deployment

Deployments run from GitHub Actions only (disable Cloudflare dashboard Git auto-build):

- **PR (non-fork):** preview to `mandate-dev` Pages project
- **`main`:** production to `mandate-prod`

Build output: `packages/apps/ui/.svelte-kit/cloudflare`

Proposed hostnames:

- dev: `mandate-dev.forestrie.dev`
- prod: `mandate.forestrie.dev`

### Doppler + GitHub Environments

**Canonical catalog:** [docs/service-secrets.md](docs/service-secrets.md) ·
**Naming ADR:** [ADR-0006](docs/adr/adr-0006-privy-secrets.md) ·
**Wallet roles:** [ADR-0005 §7](docs/adr/adr-0005-byok-delegation-modes.md),
[CONTEXT.md](CONTEXT.md)

Doppler project **`mandate-forestrie`** has three configs. GitHub uses two
**Environments** (not repo-level secrets). Sync is **Doppler ↔ GitHub** — no
push script in this repo.

| Doppler config | GitHub Environment              | Contents                                                   |
| -------------- | ------------------------------- | ---------------------------------------------------------- |
| `prod`         | `prod`                          | Operational `MANDATE_*`, Worker deploy secrets, Pages vars |
| `dev`          | _(local, repo-init, CI deploy)_ | Same operational names as `prod` for dev Workers           |
| `dev`          | `live-signer`                   | Operational `MANDATE_*` subset for CI live Privy tests     |
| `e2e`          | `live-signer`                   | All `E2E_*` fixture secrets — **never** `prod`             |

**Prefixes (ADR-0006):**

- **`MANDATE_*`** — long-lived instance secrets (Privy app, mandate
  additional-signer key, signer token, `KEY_DIRECTORY`, coordinator token).
- **`E2E_*`** — synthetic test wallets and dev Canopy/coordinator URLs; CI only.
- **`PUBLIC_MANDATE_PRIVY_*`** — UI SDK ids (GitHub **vars**, not secrets).

Never sync `E2E_*` to production Workers or the GitHub `prod` environment.

#### Operational secrets (`MANDATE_*`)

Present in Doppler **`dev`** and **`prod`** (values differ per environment).
Deployed to Workers via `deploy-workers.yml` / `wrangler secret put`.

| Name                              | Worker / use                                     |
| --------------------------------- | ------------------------------------------------ |
| `CLOUDFLARE_API_TOKEN`            | CI deploy, `task repo-init`                      |
| `CLOUDFLARE_ACCOUNT_ID`           | CI deploy, `task repo-init`                      |
| `MANDATE_PRIVY_APP_ID`            | Signer var (`wrangler.env.prod.json`)            |
| `MANDATE_PRIVY_APP_SECRET`        | Signer secret                                    |
| `MANDATE_PRIVY_API_BASE`          | Signer var (required; no code default)           |
| `MANDATE_PRIVY_SIGNER_ID`         | Key quorum id for Mode C `additional_signers`    |
| `MANDATE_PRIVY_AUTHORIZATION_KEY` | P-256 additional-signer key for owned-wallet RPC |
| `MANDATE_SIGNER_URL`              | Deployed signer URL (live tests, descriptors)    |
| `MANDATE_SIGNER_TOKEN`            | Bearer on `POST /v1/sign` (agent + signer)       |
| `COORDINATOR_APP_TOKEN`           | Agent → coordinator material submit              |
| `COORDINATOR_UPSTREAM_URL`        | Agent var                                        |
| `OPERATOR_ROOT_KEYS`              | Agent JSON per-log signer descriptors            |
| `KEY_DIRECTORY`                   | Signer JSON wallet directory                     |
| `PUBLIC_MANDATE_PRIVY_APP_ID`     | Pages build var                                  |
| `PUBLIC_MANDATE_PRIVY_CLIENT_ID`  | Pages build var                                  |
| `PUBLIC_DEFAULT_CHAIN_ID`         | Pages build var                                  |

The operator payment-authoritative log uses an **ownerless app-controlled**
Privy wallet in `KEY_DIRECTORY` (no `requiresAuthorizationSignature`). Mode C
user logs use user-owned wallets with mandate as **additional signer** only —
see ADR-0005 §7.

#### E2E fixture secrets (`E2E_*`)

Doppler config **`e2e`** only → GitHub **`live-signer`** only.

| Fixture                   | Env vars                                                                             | Role                                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Signer test wallet        | `E2E_SIGNER_TEST_*`                                                                  | User-owned; mandate additional signer; **never revoked** (`live-owned`, hands-off success) |
| Mode C kill-switch wallet | `E2E_MODE_C_USER_*`, `E2E_MODE_C_PRIVY_OWNER_AUTH_KEY`, `E2E_MODE_C_PRIVY_POLICY_ID` | User-owned; mutated by onboard/revoke/kill-switch tests                                    |
| Dev stack URLs            | `E2E_CANOPY_*`, `E2E_DELEGATION_COORDINATOR_URL`, `E2E_MANDATE_AGENT_WEBHOOK_URL`    | `live-provision` against dev Canopy/coordinator                                            |

Provision a fresh signer-test wallet (ops): `task provision:e2e-signer-test-wallet`
then set the printed keys in Doppler `e2e` and re-sync `live-signer`.

#### Live CI

Workflow [`.github/workflows/live-owned-wallet.yml`](.github/workflows/live-owned-wallet.yml)
(`workflow_dispatch`) runs against GitHub environment **`live-signer`**:

1. `live-secrets-check` — all required `MANDATE_*` + `E2E_*` present
2. `live-owned` — signer owned-wallet path + topology preflight
3. `live-hands-off` — agent webhook → signer → Privy (success + kill-switch)
4. `live-provision` — genesis + coordinator forward
5. `live-mode-c` — onboard + revoke round-trip

Trigger manually:

```sh
gh workflow run live-owned-wallet.yml --repo forestrie/mandate
```

Local equivalents: `task test:live:owned`, `task test:live:hands-off`, etc.

## `@mandate/agent` (FOR-98)

Webhook receiver Worker. Receives signed `delegation.required` events, builds
KS256 delegation certificates via `@forestrie/delegation-cose`, submits material to
the coordinator. Production remote signing uses ADR-0003 `SignRequest` against
`@mandate/signer`.

Local dev:

```sh
cp packages/apps/agent/.dev.vars.example packages/apps/agent/.dev.vars
pnpm --filter @mandate/agent dev
```

## `@mandate/signer` (ADR-0003)

Thin Privy-backed remote signer. Holds vendor secrets; agent calls
`POST /v1/sign` with bearer `MANDATE_SIGNER_TOKEN`.

- **App-controlled** entries in `KEY_DIRECTORY` sign via Basic auth (operator
  ownerless wallet).
- **Mode C** entries set `requiresAuthorizationSignature: true` and need
  `MANDATE_PRIVY_AUTHORIZATION_KEY` for the owned-wallet path.

Local dev:

```sh
cp packages/apps/signer/.dev.vars.example packages/apps/signer/.dev.vars
pnpm --filter @mandate/signer dev
```

Live owned-wallet test (needs Doppler `dev` + `e2e`):

```sh
task test:live:owned
```

## Workers deploy (FOR-99)

Fork-friendly Cloudflare Workers deploy for **mandate-agent** and
**mandate-signer**:

1. Run `task repo-init:doppler` (or `task repo-init` with `CLOUDFLARE_API_TOKEN`
   and `CLOUDFLARE_ACCOUNT_ID`). This provisions KV and writes gitignored
   `wrangler.env.prod.json` overlays (see [docs/service-secrets.md](docs/service-secrets.md)).
2. Deploy with merged configs under `.wrangler/deploy/`, or enable CI with
   repository variable `ENABLE_WORKERS_DEPLOY=true` (workflow runs `task repo-init`
   with `CICD=true` before deploy).
3. Bind secrets per [docs/service-secrets.md](docs/service-secrets.md).

`@forestrie/delegation-cose` is installed from GitHub Packages (exact version pin;
see [ADR-0004](docs/adr/adr-0004-delegation-cose-distribution.md)). Forks need
root `.npmrc` and `NODE_AUTH_TOKEN` with `read:packages` (`gh auth token` or a
PAT; run `gh auth refresh -s read:packages -h github.com` if install returns 403) before `pnpm install`.

## Coordinator types

Types live in `packages/libs/coordinator-types/` (synced from
`canopy/packages/apps/delegation-coordinator`). Re-sync when coordinator APIs
change:

```sh
pnpm sync:coordinator-types
```

## Related docs

- [CONTEXT.md](CONTEXT.md) — domain glossary (operational vs E2E secrets, wallet roles)
- [service-secrets.md](docs/service-secrets.md) — full secret catalog + live test matrix
- [ADR-0005 BYOK delegation modes](docs/adr/adr-0005-byok-delegation-modes.md)
- [ADR-0006 secret naming](docs/adr/adr-0006-privy-secrets.md)
- [plan-0001 bootstrap](docs/plans/plan-0001-bootstrap.md)
- [plan-0003 FOR-97 package split](docs/plans/plan-0003-for-97-package-split.md)
- [plan-0004 FOR-98 agent](docs/plans/plan-0004-for-98-agent.md)
- [plan-0005 FOR-104 signer spike](docs/plans/plan-0005-for-104-signer-backend-spike.md)
- [ADR-0002 delegation signer custody](docs/adr/adr-0002-delegation-signer-custody.md)
- [ADR-0003 delegation signer backend](docs/adr/adr-0003-delegation-signer-backend.md)
- [ADR-0001 auth strategy seams](docs/adr-0001-auth-strategy-seams.md)
- [devdocs ARC-0022 BYOK sealing](https://github.com/forestrie/devdocs/blob/main/arc/arc-0022-byok-user-log-delegation-and-operator-hosted-sealing.md)
- [canopy plan-0021](https://github.com/forestrie/canopy/blob/main/docs/plans/plan-0021-delegation-coordinator-apis.md)
