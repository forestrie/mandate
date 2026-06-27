# GitHub Packages: `@forestrie/delegation-cose` (FOR-119 / FOR-109)

Mandate pins exact semver `@forestrie/delegation-cose@0.1.1` from GitHub
Packages (see [ADR-0004](../adr/adr-0004-delegation-cose-distribution.md)).

## CI auth (cross-repo)

Default `GITHUB_TOKEN` is repo-scoped and returns **403** for packages
published from `forestrie/canopy`. Mandate workflows mint a short-lived org
**GitHub App** installation token (canopy / forest-1 pattern):

| Setting              | Location                           |
| -------------------- | ---------------------------------- |
| `GITAPP_ID`          | Repository or environment variable |
| `GITAPP_PRIVATE_KEY` | Repository or environment secret   |

Composite action: [`.github/actions/github-packages-token`](../../.github/actions/github-packages-token/action.yml).

The app needs **`packages: read`** on the forestrie org installation.

### GitHub App permission (org admin)

If install returns `Permission installation not allowed to Read organization
package`, the forestrie org GitHub App is missing **Packages → Read** (or
Read-only). Update under **GitHub → Organization settings → Developer settings
→ GitHub Apps → [app] → Permissions**, then save and accept the org permission
request.

Mandate repo settings: variable **`GITAPP_ID`**, secret **`GITAPP_PRIVATE_KEY`**
(same app as arbor-flux / forest-platform Doppler `GITAPP_*`).

## Local / fork install

Root `.npmrc` + `NODE_AUTH_TOKEN` with `read:packages` (`gh auth token` after
`gh auth refresh -s read:packages`, or a PAT). GitHub Packages requires a
token even for public packages.

## Investigation (2026-06-22)

| Check                                      | Result                                              |
| ------------------------------------------ | --------------------------------------------------- |
| `publish-delegation-cose.yml` (2026-06-27) | `@forestrie/delegation-cose@0.1.1` public (FOR-218) |
| Mandate CI with `GITHUB_TOKEN` only        | 403 cross-repo                                      |
| Mandate CI with GitHub App token           | Registry semver install (FOR-109)                   |
