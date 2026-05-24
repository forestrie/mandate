# Sylvestris

BYOK delegation wallet console for Forestrie. Sylvestris is an isolated SvelteKit app
that talks to the [delegation coordinator](https://github.com/forestrie/canopy) through a
same-origin BFF — private keys stay in the browser via [Privy](https://privy.io).

## Stack

- SvelteKit 2 + Svelte 5
- Cloudflare Pages (`@sveltejs/adapter-cloudflare`)
- Privy (`@privy-io/js-sdk-core`, client-only)
- Tailwind CSS v4 + lightweight UI primitives

## Local development

1. Copy env templates:

   ```sh
   cp .env.example .env
   cp .dev.vars.example .dev.vars
   ```

2. Fill in Privy app IDs (public) and coordinator secrets in `.dev.vars`:
   - `COORDINATOR_APP_TOKEN`
   - `COORDINATOR_UPSTREAM_URL` (default: `https://coordinator-dev.forestrie.dev`)

3. Run with Doppler (recommended):

   ```sh
   task dev:doppler
   ```

   Or plain Vite after hydrating `.env` / `.dev.vars`:

   ```sh
   pnpm dev
   ```

## Scripts

| Command                       | Purpose                                        |
| ----------------------------- | ---------------------------------------------- |
| `pnpm dev`                    | Vite dev server                                |
| `pnpm build`                  | Cloudflare Pages build (`CF_PAGES=1`)          |
| `pnpm check`                  | Typecheck                                      |
| `pnpm test`                   | Vitest unit tests                              |
| `pnpm sync:coordinator-types` | Copy types from sibling `canopy` checkout      |
| `pnpm audit:client-secrets`   | Ensure server secrets are not in client bundle |

## Architecture

```text
Browser (Privy wallet)
  → Sylvestris Pages Functions (/api/coordinator/* BFF)
  → delegation-coordinator (coordinator-dev.forestrie.dev)
```

Auth modes are pluggable — v1 uses `app_token_bff` (server holds `COORDINATOR_APP_TOKEN`).
See [docs/adr-0001-auth-strategy-seams.md](docs/adr-0001-auth-strategy-seams.md).

## Deployment

Deployments run from GitHub Actions only (disable Cloudflare dashboard Git auto-build):

- **PR (non-fork):** preview to `sylvestris-dev` Pages project
- **`main`:** production to `sylvestris-prod`

Proposed hostnames:

- dev: `sylvestris-dev.forestrie.dev`
- prod: `sylvestris.forestrie.dev`

### Doppler + GitHub Environments

Create Doppler project **`sylvestris`** with `dev` and `prod` configs synced to GitHub
Environments **`dev`** and **`prod`**.

| Secret / variable         | dev | prod |
| ------------------------- | --- | ---- |
| `CLOUDFLARE_API_TOKEN`    | yes | yes  |
| `CLOUDFLARE_ACCOUNT_ID`   | yes | yes  |
| `COORDINATOR_APP_TOKEN`   | yes | yes  |
| `PUBLIC_PRIVY_APP_ID`     | var | var  |
| `PUBLIC_PRIVY_CLIENT_ID`  | var | var  |
| `PUBLIC_DEFAULT_CHAIN_ID` | var | var  |

Set production `COORDINATOR_UPSTREAM_URL` and `COORDINATOR_AUTH_MODE` in the Cloudflare
Pages project settings (or `.dev.vars` / wrangler vars for local).

### Vercel fallback

Set `ADAPTER=vercel` and run `pnpm build` to use `@sveltejs/adapter-vercel`. No Vercel
workflow is included in v1.

## Coordinator types

Types under `src/lib/coordinator/types/` are copied from
`canopy/packages/apps/delegation-coordinator`. Re-sync when coordinator APIs change:

```sh
pnpm sync:coordinator-types
```

## Related docs

- [plan-0001 bootstrap](docs/plans/plan-0001-bootstrap.md)
- [ADR-0001 auth strategy seams](docs/adr-0001-auth-strategy-seams.md)
- [canopy plan-0021](https://github.com/forestrie/canopy/blob/main/docs/plans/plan-0021-delegation-coordinator-apis.md)
