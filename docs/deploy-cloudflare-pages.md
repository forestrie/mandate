# Cloudflare Pages setup

Manual steps after first deploy (one-time ops):

1. Create Pages projects **`sylvestris-dev`** and **`sylvestris-prod`** in the Forestrie
   Cloudflare account.
2. **Disable** “Connect to Git” / automatic builds on both projects — GitHub Actions is the
   sole deploy path.
3. Bind custom domains:
   - dev: `sylvestris-dev.forestrie.dev`
   - prod: `sylvestris.forestrie.dev`
4. Set production Pages environment variables:
   - `COORDINATOR_UPSTREAM_URL` = `https://coordinator.forestrie.dev`
   - `COORDINATOR_AUTH_MODE` = `app_token_bff`
5. Set secrets via deploy workflow or `wrangler pages secret put`:
   - `COORDINATOR_APP_TOKEN`

Preview project (`sylvestris-dev`) should use dev coordinator URL (default in
`wrangler.jsonc`).
