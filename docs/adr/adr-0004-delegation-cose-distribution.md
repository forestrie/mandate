# ADR-0004: delegation-cose distribution via GitHub Packages

## Status

Accepted (FOR-106)

## Context

Mandate builds KS256 delegation certificates with the shared
`delegation-cose` library from the canopy monorepo. ADR-0002 requires forks to
install that library without cloning canopy. An interim vendored `.tgz` in the
agent package was opaque and duplicated in spikes.

GitHub Packages requires the npm scope to match the owning GitHub org
(`@forestrie/delegation-cose`). Public npm distribution is deferred until the
`@forestrie` npm org is managed separately.

## Decision

1. **Publish from canopy** as `@forestrie/delegation-cose` to GitHub Packages
   (public visibility; canopy repo is public). Release on git tag
   `delegation-cose-v*` via `.github/workflows/publish-delegation-cose.yml`.

2. **Mandate pins an exact version** (no semver range) so a canopy republish
   cannot change the signing artifact without an explicit mandate bump PR.

3. **CI read auth** uses the workflow **`GITHUB_TOKEN`** with
   `permissions: packages: read` and `NODE_AUTH_TOKEN` at `pnpm install`.
   **`@forestrie/delegation-cose`** must grant **`forestrie/mandate`** Actions
   read access under package settings. GitHub App installation tokens are not
   supported by the npm registry (FOR-109).

   Mandate pins **`0.1.1`** via **git tag** until registry auth is verified;
   run **`refresh-delegation-cose-lockfile`** workflow to switch to exact semver
   - lockfile tarball.

   **Historical:** Default `GITHUB_TOKEN` returned 403 until package Actions
   access was configured (FOR-218 public publish + package settings).

4. **Forks and local dev** configure root `.npmrc` and supply
   `NODE_AUTH_TOKEN` from `gh auth token` or a PAT with `read:packages`. GitHub
   Packages requires a token even for public packages.

5. **Agent verify-before-submit.** After building the certificate, the agent
   calls `verifyDelegationCertificateKs256` and binds parsed payload fields
   (`logId`, `mmrStart`, `mmrEnd`) to the webhook event before coordinator
   submit. This is a defense-in-depth check (FOR-110); the coordinator and
   on-chain paths remain authoritative.

## Consequences

- Mandate depends on GitHub Packages availability for installs; lockfile
  integrity hash pins the tarball content.
- Future migration to public npmjs is a separate issue; package name stays
  `@forestrie/delegation-cose`.
- Canopy workspace consumers use the same package name via `workspace:*`.

## Alternatives considered

- **Public npmjs now:** rejected — no managed `@forestrie` npm org yet.
- **Private GitHub Packages + org App for every consumer:** rejected for forks;
  public package + default-token CI read is sufficient.
- **Keep vendored `.tgz`:** rejected — supply-chain and auditability risk (S4).
