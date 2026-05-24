# Plan 0001: Mandate bootstrap

**Status:** DRAFT  
**Date:** 2026-05-24  
**Related:** [ADR-0001](../adr-0001-auth-strategy-seams.md),
[plan-0002 rename](plan-0002-rename-sylvestris-to-mandate.md),
[canopy plan-0021](https://github.com/forestrie/canopy/blob/main/docs/plans/plan-0021-delegation-coordinator-apis.md),
[univocity plan-0029](https://github.com/forestrie/univocity/blob/main/docs/plans/plan-0029-eip-compatible-ks256-signers.md)

## Goal

Bootstrap **Mandate** as an isolated SvelteKit app for BYOK delegation wallet UX:
connect wallet, list pending delegation needs, sign KS256 payload hash, submit material to
the delegation coordinator via a BFF.

## Decisions

| Area                  | Choice                                                  |
| --------------------- | ------------------------------------------------------- |
| Repo                  | `forestrie/mandate` (isolated from canopy workers)      |
| Deploy                | Cloudflare Pages + GitHub Actions                       |
| Wallet                | Privy (`@privy-io/js-sdk-core`, client-only)            |
| Coordinator access v1 | BFF with `COORDINATOR_APP_TOKEN`                        |
| Future auth           | Strategy interfaces for issuer token + wallet challenge |

## Scope (bootstrap)

- SvelteKit + adapter-cloudflare + Tailwind v4
- BFF `/api/coordinator/*` with path allowlist
- Privy email login + embedded EOA signing (`secp256k1_sign`)
- Pending list + material submit vertical slice
- Auth/signing backend stubs for Safe and wallet-challenge
- CI: test, PR preview deploy, main prod deploy
- Doppler project `mandate` (documented; manual setup)

## Out of scope (bootstrap)

- Full COSE delegation certificate assembly
- Safe / ERC-1271 multisig signing
- Wallet-challenge auth implementation
- Coordinator CORS (BFF is same-origin)

## Acceptance criteria

- [x] Repo scaffold with adapter-cloudflare
- [x] BFF proxy with app-token auth strategy
- [x] Privy client wrapper + delegations UI (`ssr = false`)
- [x] Coordinator types sync script
- [x] GHA workflows for test / preview / prod
- [ ] Doppler project created and synced (manual ops)
- [ ] Cloudflare Pages projects + custom domains (manual ops)
