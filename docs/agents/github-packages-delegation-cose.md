# GitHub Packages: `@forestrie/delegation-cose` (FOR-119)

Mandate currently pins `@forestrie/delegation-cose` via a git dependency:

```json
"github:forestrie/canopy#delegation-cose-v0.1.0&path:packages/libs/delegation-cose"
```

FOR-109 switches to semver once registry install is reliable in CI and locally.

## Investigation (2026-06-22)

| Check | Result |
| ----- | ------ |
| `gh api /orgs/forestrie/packages/npm/@forestrie%2fdelegation-cose` | **404** without `read:packages` on CLI token (org list API) |
| `publish-delegation-cose.yml` workflow_dispatch (2026-06-27) | **Success** — `@forestrie/delegation-cose@0.1.0` republished |
| Mandate CI | `permissions: packages: read` + `NODE_AUTH_TOKEN=${{ secrets.GITHUB_TOKEN }}` |

**Resolved (FOR-218):** `@forestrie/delegation-cose@0.1.1` published with
`publishConfig.access: public`. Mandate pins exact semver `0.1.1` from
GitHub Packages (FOR-109).
