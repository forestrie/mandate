# Plan 0045 — Package E Mode B reference (index)

**Status:** ACTIVE (orchestration in Linear)  
**Date:** 2026-06-27  
**Epic:** [FOR-206](https://linear.app/forestrie/issue/FOR-206)  
**Parent PRD:** [FOR-189](https://linear.app/forestrie/issue/FOR-189)

---

## Purpose

Thin repo index for **Package E — Mode B reference and fork story**. Primary
design material, acceptance criteria, acceptance test definitions, Graphite
stack, and review checklist live in **Linear** (not duplicated here).

---

## Issue stack

| Phase        | Issue                                                       | Branch                                |
| ------------ | ----------------------------------------------------------- | ------------------------------------- |
| Epic         | [FOR-206](https://linear.app/forestrie/issue/FOR-206)       | —                                     |
| 0 Design     | [FOR-207](https://linear.app/forestrie/issue/FOR-207)       | `robin/for-207-mode-b-design`         |
| 1 Routing    | [FOR-208](https://linear.app/forestrie/issue/FOR-208)       | `robin/for-208-mode-b-routing`        |
| 2 Ref signer | [FOR-209](https://linear.app/forestrie/issue/FOR-209)       | `robin/for-209-reference-user-signer` |
| 3 Live e2e   | [FOR-210](https://linear.app/forestrie/issue/FOR-210)       | `robin/for-210-mode-b-live-e2e`       |
| 4 Docs       | [FOR-211](https://linear.app/forestrie/issue/FOR-211)       | `robin/for-211-forking-mode-b`        |
| Review       | [FOR-212](https://linear.app/forestrie/issue/FOR-212)       | `robin/for-212-mode-b-review`         |
| Close        | [FOR-213](https://linear.app/forestrie/issue/FOR-213)       | merge only                            |
| Optional     | [FOR-105](https://linear.app/forestrie/issue/FOR-105) ES256 | `robin/for-105-es256-signer`          |

**Legacy tracking:** [FOR-111](https://linear.app/forestrie/issue/FOR-111) absorbed
by the stack above.

---

## Worktree

```bash
git worktree add ~/Dev/personal/forestrie/.worktrees/mandate-mode-b main
cd ~/Dev/personal/forestrie/.worktrees/mandate-mode-b
```

See [FOR-206](https://linear.app/forestrie/issue/FOR-206) for full `gt` stack
commands.

---

## Related docs

- [ADR-0005 BYOK modes](../adr/adr-0005-byok-delegation-modes.md)
- [ADR-0003 signer backend](../adr/adr-0003-delegation-signer-backend.md)
- [ARC-0022 §4.1](../../../devdocs/arc/arc-0022-byok-user-log-delegation-and-operator-hosted-sealing.md)
- [FORKING.md](../../FORKING.md) (§5b updated in FOR-211)
