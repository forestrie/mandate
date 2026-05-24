# Plan 0002: Rename Sylvestris to Mandate

**Status:** ACCEPTED  
**Date:** 2026-05-24  
**Related:** [plan-0001-bootstrap](plan-0001-bootstrap.md)

## Goal

Rename the delegation wallet console from **Sylvestris** to **Mandate** — repo, package,
CI deploy targets, and product strings — while keeping all changes inside this repository.

## Naming map

| Asset                    | From                                                       | To                                                   |
| ------------------------ | ---------------------------------------------------------- | ---------------------------------------------------- |
| GitHub repo              | `forestrie/sylvestris`                                     | `forestrie/mandate`                                  |
| npm package              | `sylvestris`                                               | `mandate`                                            |
| Wrangler worker name     | `sylvestris`                                               | `mandate`                                            |
| Pages projects (target)  | `sylvestris-dev`, `sylvestris-prod`                        | `mandate-dev`, `mandate-prod`                        |
| Hostnames (target)       | `sylvestris-dev.forestrie.dev`, `sylvestris.forestrie.dev` | `mandate-dev.forestrie.dev`, `mandate.forestrie.dev` |
| Doppler project (target) | `sylvestris`                                               | `mandate`                                            |

## Out of scope

- Sibling repo edits (canopy plan links, forest-1 DNS/Terraform)
- Cloudflare Pages project create/rename (dashboard ops)
- Doppler project rename (dashboard ops)
- DNS CNAME provisioning (coordinate with sibling DNS work)

## Acceptance criteria

- [x] Zero `sylvestris` / `Sylvestris` in tracked source (excluding git history)
- [x] GitHub repo renamed to `forestrie/mandate`
- [x] Local checkout at `forestrie/mandate`
- [x] CI workflows reference `mandate-dev` / `mandate-prod` Pages project names
- [x] In-repo docs describe target hostnames (documentation only)
