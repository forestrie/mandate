# Plan 0043 — Kill-switch production polish (Package B)

**Status:** IN PROGRESS — orchestration pointer only  
**Date:** 2026-06-27  
**Authoritative spec:** [FOR-191](https://linear.app/forestrie/issue/FOR-191) (Linear)

Design, acceptance criteria, and acceptance tests live in Linear under
FOR-191 and its child issues. Do not duplicate here.

## Branch naming

[FOR-179](https://linear.app/forestrie/issue/FOR-179) /
[branch-naming.mdc](../../.cursor/rules/branch-naming.mdc):

```text
<user>/for-<issue-no>-<short-desc>
```

One branch per Linear issue. Graphite stacks use the same format.

## Stack

| Issue   | Branch                          | Lands                                                                      |
| ------- | ------------------------------- | -------------------------------------------------------------------------- |
| FOR-130 | `robin/for-130-targeted-revoke` | `removeMandateAdditionalSigner`, targeted revoke + full-clear escape hatch |
| FOR-132 | `robin/for-132-cli-safety`      | revoke CLI guardrails (`--confirm-wallet-id`, `--yes`, clear-all gate)     |
| FOR-131 | `robin/for-131-post-revoke`     | `describe-post-revoke-actions` + KEY_DIRECTORY hygiene runbook             |
| FOR-192 | `robin/for-192-review`          | review pass; ADR-0005 / CONTEXT.md / plan stub                             |
| FOR-193 | merge + epic close (no branch)  | push stack, fix CI, open PRs, close FOR-191                                |

## Worktree

```bash
git worktree add ~/Dev/personal/forestrie-wt/mandate-kill-switch main
cd ~/Dev/personal/forestrie-wt/mandate-kill-switch
gt trunk
gt create robin/for-130-targeted-revoke -m "feat(privy-admin): targeted mandate revoke (FOR-130)"
gt create robin/for-132-cli-safety -m "feat(register): revoke CLI guardrails (FOR-132)"
gt create robin/for-131-post-revoke -m "feat(register): post-revoke hygiene helper (FOR-131)"
gt create robin/for-192-review -m "docs(adr): record kill-switch polish (FOR-192)"
gt submit --stack
```

## Related

- [FOR-189](https://linear.app/forestrie/issue/FOR-189) PRD Package 3
- [plan-0008](plan-0008-for-114-mode-c-kill-switch.md) FOR-114 v1 (shipped)
- [plan-0009](plan-0009-for-review-followups-test-maintainability.md) review follow-ups
