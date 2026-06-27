# Plan 0044 — Delegation console (Package C)

**Status:** IN PROGRESS — orchestration pointer only  
**Date:** 2026-06-27  
**Authoritative spec:** [FOR-115](https://linear.app/forestrie/issue/FOR-115) (Linear)

Design, acceptance criteria, and acceptance tests live in Linear under
FOR-115 and its child issues. Do not duplicate here.

## Branch naming

[branch-naming.mdc](../.cursor/rules/branch-naming.mdc):

```text
<user>/for-<issue-no>-<short-desc>
```

One branch per Linear issue. Graphite stacks use the same format.

## Stack

| Issue | Branch |
|-------|--------|
| FOR-195 | `robin/for-195-ui-delegation-cose-cert` |
| FOR-196 | `robin/for-196-ui-console-status` |
| FOR-197 | `robin/for-197-ui-modec-revoke` |
| FOR-198 | `robin/for-198-ui-review` |
| FOR-199 | merge + epic close (no branch) |

## Worktree

```bash
git worktree add ~/Dev/personal/forestrie-wt/mandate-delegations-ui origin/main
cd ~/Dev/personal/forestrie-wt/mandate-delegations-ui
git switch -c robin/for-195-ui-delegation-cose-cert
# ... stack branches ...
```

## Related

- [FOR-189](https://linear.app/forestrie/issue/FOR-189) PRD Package 3
- [FOR-129](https://linear.app/forestrie/issue/FOR-129) wallet-challenge BFF (shipped)
- [FOR-200](https://linear.app/forestrie/issue/FOR-200) deferred audit endpoint
