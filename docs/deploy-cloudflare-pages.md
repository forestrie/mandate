# Cloudflare Pages setup

Target project names and hostnames for Mandate. **Provisioning is manual** — create
Pages projects, bind custom domains, and rename the Doppler project when sibling DNS
work is ready. Do not provision DNS from this repo.

Manual steps after first deploy (one-time ops):

1. Create Pages projects **`mandate-dev`** and **`mandate-prod`** in the Forestrie
   Cloudflare account.
2. **Disable** “Connect to Git” / automatic builds on both projects — GitHub Actions is the
   sole deploy path.
3. Bind custom domains:
   - dev: `mandate-dev.forestrie.dev`
   - prod: `mandate.forestrie.dev`
4. Set production Pages environment variables:
   - `COORDINATOR_UPSTREAM_URL` = `https://coordinator.forestrie.dev`
   - `COORDINATOR_AUTH_MODE` = `app_token_bff`
5. Set secrets via deploy workflow or `wrangler pages secret put`:
   - `COORDINATOR_APP_TOKEN`

Preview project (`mandate-dev`) should use dev coordinator URL (default in
`wrangler.jsonc`).

## Doppler (manual)

Rename or create Doppler project **`mandate`** with `dev` and `prod` configs synced to
GitHub Environments **`dev`** and **`prod`**.

## GitHub Actions deploy gate

Deploy workflows are gated on repository variable **`ENABLE_PAGES_DEPLOY=true`**
(set under Settings → Secrets and variables → Actions → Variables). Keep it unset
until **`dev`** / **`prod`** environments have `CLOUDFLARE_API_TOKEN`,
`CLOUDFLARE_ACCOUNT_ID`, and `COORDINATOR_APP_TOKEN`.
