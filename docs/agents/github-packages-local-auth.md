# GitHub Packages — local install auth — RETIRED (FOR-336)

**Status: retired.** `pnpm install` is tokenless: `@forestrie/delegation-cose`
resolves from **public npmjs**. Do **not** set `NODE_AUTH_TOKEN` or re-add a
`@forestrie:registry=https://npm.pkg.github.com` mapping — GitHub Packages
holds a stale 0.1.2 and must not be on the install path.

If you see `ERR_PNPM_FETCH_403 … @forestrie/…`, check for a leftover scope
mapping in a user-level `~/.npmrc` and remove it.

See also
[github-packages-delegation-cose.md](./github-packages-delegation-cose.md).
