# GitHub Packages: `@forestrie/delegation-cose` (FOR-119 / FOR-109)

Mandate pins exact semver `@forestrie/delegation-cose@0.1.1` from GitHub
Packages (see [ADR-0004](../adr/adr-0004-delegation-cose-distribution.md)).

## CI auth

Workflows use **`GITHUB_TOKEN`** with `permissions: packages: read` and
`NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}` at `pnpm install`.

**Package setting (org admin):** `@forestrie/delegation-cose` → **Package
settings** → **Manage Actions access** → add **`forestrie/mandate`** (read).

GitHub App installation tokens are **not** supported by the npm registry; app
`packages: read` on `forestrie-cd` does not work for `npm.pkg.github.com`.

## Local / fork install

Root `.npmrc` + `NODE_AUTH_TOKEN` with `read:packages` (`gh auth token` after
`gh auth refresh -s read:packages`, or a PAT). GitHub Packages requires a
token even for public packages.

## Status

| Check                                      | Result                                              |
| ------------------------------------------ | --------------------------------------------------- |
| `publish-delegation-cose.yml` (2026-06-27) | `@forestrie/delegation-cose@0.1.1` public (FOR-218) |
| Mandate CI with `GITHUB_TOKEN` + Actions access | Registry semver install (FOR-109)              |
