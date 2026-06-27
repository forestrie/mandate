# GitHub Packages: `@forestrie/delegation-cose` (FOR-119)

Mandate currently pins `@forestrie/delegation-cose` via a git dependency:

```json
"github:forestrie/canopy#delegation-cose-v0.1.0&path:packages/libs/delegation-cose"
```

FOR-109 switches to semver once registry install is reliable in CI and locally.

## Investigation (2026-06-22)

| Check | Result |
| ----- | ------ |
| `gh api /orgs/forestrie/packages/npm/@forestrie%2fdelegation-cose` | **404** — package not visible to org API |
| `npm view @forestrie/delegation-cose --registry=https://npm.pkg.github.com` with `gh auth token` | **403** — OAuth CLI token lacks `read:packages` (expected) |
| Spike lockfile (`spikes/for-104-delegation-signer/pnpm-lock.yaml`) | tarball URL for `0.1.0` exists — package may have been published once |

## Unblock path (canopy repo)

1. Confirm tag `delegation-cose-v0.1.0` exists on `forestrie/canopy`.
2. Re-run [publish-delegation-cose.yml](https://github.com/forestrie/canopy/blob/main/.github/workflows/publish-delegation-cose.yml) via `workflow_dispatch` or push tag `delegation-cose-v0.1.1` if a republish is needed.
3. Verify install with a PAT that has `read:packages`:

   ```bash
   npm view @forestrie/delegation-cose version \
     --registry=https://npm.pkg.github.com
   ```

4. Ensure mandate CI `.npmrc` / `NODE_AUTH_TOKEN` uses `GITHUB_TOKEN` or a PAT with `read:packages` (see mandate ADR-0004).

FOR-109 (semver pin + lockfile) follows once step 3 succeeds in mandate CI.
