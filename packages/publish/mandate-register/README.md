# @forestrie/mandate-register

Bundled `mandate-register` CLI for cross-repo system tests (ARC-0024). Publishes
to GitHub Packages; consumers install via manifest `kits` pins in
`forestrie/system-testing`.

Build bundles `@mandate/register` + `@mandate/privy-admin` with esbuild.

```bash
pnpm --filter @forestrie/mandate-register build
pnpm --filter @forestrie/mandate-register test
```

Release tag: `mandate-register-v0.1.0` (see `.github/workflows/publish-mandate-register.yml`).
