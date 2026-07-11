# @forestrie/mandate-register

Bundled `mandate-register` CLI (ARC-0024): Univocity instance provisioning,
onboarding, and BYOK custody-mode operations. Published to **public npmjs**
with SLSA provenance (FOR-360) — no registry token, no GitHub account, no
relationship with the mandate operator is required to install or run it.

That is the point: the exit paths documented in
[FORKING.md](../../FORKING.md) and
[ADR-0005](../../docs/adr/adr-0005-byok-delegation-modes.md) are only credible
if a forker can drive them with tooling the operator cannot gate. This package
is that tooling.

## Usage (tokenless)

```bash
npx @forestrie/mandate-register            # list subcommands
npx @forestrie/mandate-register provision --mode B ...
npx @forestrie/mandate-register onboard request ...
```

Subcommands:

| Command                                 | Purpose                                                   |
| --------------------------------------- | --------------------------------------------------------- |
| `onboard request` / `status` / `redeem` | Self-service onboard token flow (FOR-173)                 |
| `provision`                             | Full genesis + descriptor emission (FOR-100)              |
| `privy onboard-mode-c`                  | Mode C Privy wallet onboarding (FOR-112)                  |
| `privy revoke-mode-c`                   | Mode C kill switch — remove mandate as signer (FOR-114)   |
| `privy describe-post-revoke-actions`    | Post-revoke KEY_DIRECTORY checklist (FOR-131)             |
| `privy exit-to-mode-b`                  | Repoint agent signing to a user-operated signer (FOR-311) |

### Exiting to Mode B

The Mode C→B exit ([ADR-0005 operational appendix](../../docs/adr/adr-0005-byok-delegation-modes.md),
[FORKING.md §5b](../../FORKING.md)) runs entirely through this CLI:

```bash
# step 2 — revoke mandate's signer access on the user-owned wallet
npx @forestrie/mandate-register privy revoke-mode-c \
  --wallet-id <id> --mandate-signer-id <quorum-id> ...

# step 3 — repoint the deployed agent at a user-operated signer
npx @forestrie/mandate-register privy exit-to-mode-b \
  --log-id <32-hex> --signer-url https://<your-signer>/v1/sign ...
```

`publicRoot` is unchanged by the exit (ARC-0022 I5): the same key keeps
signing under a new operator with no re-registration.

## Development

Build bundles `@mandate/register` + `@mandate/privy-admin` with esbuild:

```bash
pnpm --filter @forestrie/mandate-register build
pnpm --filter @forestrie/mandate-register test
```

## Releasing

Tag `mandate-register-v<version>` (matching `package.json`) on `main`;
[publish-mandate-register.yml](../../.github/workflows/publish-mandate-register.yml)
publishes to npmjs via OIDC trusted publishing in the `npm-publish`
environment. Cross-repo consumers (e.g. `forestrie/system-testing`) install
via their manifest `kits` pins.
