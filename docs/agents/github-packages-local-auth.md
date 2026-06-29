# GitHub Packages — local install auth

CI uses workflow **`GITHUB_TOKEN`** with `permissions: packages: read`. Local
`pnpm install` needs the same capability on your machine.

## Symptom

```text
ERR_PNPM_FETCH_403 … @forestrie/delegation-cose … Forbidden
```

## Cause

`gh auth token` defaults to **`repo`** scopes only. GitHub Packages **requires
`read:packages` even for public packages** (FOR-218).

## Fix

```bash
gh auth refresh -h github.com -s read:packages
export NODE_AUTH_TOKEN="$(gh auth token)"
pnpm install
```

See also [github-packages-delegation-cose.md](./github-packages-delegation-cose.md).
