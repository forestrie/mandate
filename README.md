# Mandate

BYOK Univocity instance management for Forestrie — operator console, delegation
agent, and registration provisioner. The **operator console** (`@mandate/ui`) is a
SvelteKit app that talks to the
[delegation coordinator](https://github.com/forestrie/canopy) through a same-origin
BFF; private keys stay in the browser via [Privy](https://privy.io).

## Monorepo layout

```text
packages/
  apps/
    ui/        @mandate/ui — operator console (Cloudflare Pages)
    agent/     @mandate/agent — webhook receiver + signer (Worker, FOR-98)
    register/  @mandate/register — instance provisioning (FOR-100)
  libs/
    coordinator-types/  shared coordinator API types (@mandate/coordinator-types)
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

| Command                       | Purpose                                    |
| ----------------------------- | ------------------------------------------ |
| `pnpm dev`                    | Vite dev server (`@mandate/ui`)            |
| `pnpm build`                  | Build all workspace packages               |
| `pnpm build:ui`               | Cloudflare Pages build for ui only         |
| `pnpm check`                  | Typecheck all packages                     |
| `pnpm test`                   | Vitest across workspace                    |
| `pnpm sync:coordinator-types` | Copy types from sibling `canopy` checkout  |
| `pnpm audit:client-secrets`   | Ensure server secrets are not in ui bundle |

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

Create Doppler project **`mandate`** with `dev` and `prod` configs synced to GitHub
Environments **`dev`** and **`prod`**.

| Secret / variable         | dev | prod |
| ------------------------- | --- | ---- |
| `CLOUDFLARE_API_TOKEN`    | yes | yes  |
| `CLOUDFLARE_ACCOUNT_ID`   | yes | yes  |
| `COORDINATOR_APP_TOKEN`   | yes | yes  |
| `PUBLIC_PRIVY_APP_ID`     | var | var  |
| `PUBLIC_PRIVY_CLIENT_ID`  | var | var  |
| `PUBLIC_DEFAULT_CHAIN_ID` | var | var  |

## `@mandate/agent` (FOR-98)

Webhook receiver Worker. Receives signed `delegation.required` events, builds
KS256 delegation certificates via `@canopy/delegation-cose`, submits material to
the coordinator.

Local dev:

```sh
cp packages/apps/agent/.dev.vars.example packages/apps/agent/.dev.vars
pnpm --filter @mandate/agent dev
```

`@canopy/delegation-cose` is vendored as
`packages/apps/agent/canopy-delegation-cose-0.1.0.tgz`. Refresh from a sibling
`canopy` checkout:

```sh
cd ../canopy/packages/libs/delegation-cose && pnpm pack \
  --pack-destination /path/to/mandate/packages/apps/agent
cd /path/to/mandate && pnpm install
```

## Coordinator types

Types live in `packages/libs/coordinator-types/` (synced from
`canopy/packages/apps/delegation-coordinator`). Re-sync when coordinator APIs
change:

```sh
pnpm sync:coordinator-types
```

## Related docs

- [plan-0001 bootstrap](docs/plans/plan-0001-bootstrap.md)
- [plan-0003 FOR-97 package split](docs/plans/plan-0003-for-97-package-split.md)
- [plan-0004 FOR-98 agent](docs/plans/plan-0004-for-98-agent.md)
- [ADR-0002 delegation signer custody](docs/adr/adr-0002-delegation-signer-custody.md)
- [ADR-0001 auth strategy seams](docs/adr-0001-auth-strategy-seams.md)
- [canopy plan-0021](https://github.com/forestrie/canopy/blob/main/docs/plans/plan-0021-delegation-coordinator-apis.md)
