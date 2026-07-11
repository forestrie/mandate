# GitHub Packages: `@forestrie/delegation-cose` — RETIRED (FOR-336)

**Status: retired.** Mandate installs `@forestrie/delegation-cose` from
**public npmjs** (`^0.1.3`, SLSA provenance, tokenless install). The GitHub
Packages install path documented here (FOR-119 / FOR-109) was removed by
FOR-336 / plan-2607-12 Phase 1:

- root `.npmrc` no longer maps the `@forestrie` scope to `npm.pkg.github.com`
- CI workflows no longer set `registry-url` / `scope` on `actions/setup-node`
  or `NODE_AUTH_TOKEN` at `pnpm install`
- the `refresh-delegation-cose-lockfile.yml` exact-pin refresh workflow is
  deleted

GitHub Packages still hosts a **stale 0.1.2** — nothing on the install path
may reference it. The **publish** side of mandate's own kits
(`@forestrie/mandate-register`, `@forestrie/mandate-ui-e2e-kit`) still targets
GitHub Packages via `publishConfig.registry`; the publish workflows write the
`//npm.pkg.github.com/:_authToken` line only at the publish step.

Historical rationale for the retired pattern:
[ADR-0004](../adr/adr-0004-delegation-cose-distribution.md).
