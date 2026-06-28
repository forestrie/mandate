# AGENTS.md

Mandate: BYOK Univocity instance management (operator UI, delegation agent,
signer, register). Human setup: [README.md](README.md). Platform glossary:
[devdocs/glossary.md](../devdocs/glossary.md).

Sibling repos: **canopy** (delegation coordinator), **univocity** (contracts).

## Git worktrees

The **home clone** (`~/Dev/personal/forestrie/mandate`) stays on **`main`**
(fast-forwarded to `origin/main`). Do not check out feature branches here.

**Agents and parallel work** use a git worktree under **`../.worktrees/`**
(resolves to `~/Dev/personal/forestrie/.worktrees/`):

```bash
git fetch origin
git worktree add ../.worktrees/mandate-for-<issue>-<slug> \
  -b robin/for-<issue>-<slug> origin/main
git worktree add ../.worktrees/mandate-for-<issue>-<slug> robin/for-<issue>-<slug>
```

When work merges to `main`, remove the worktree:
`git worktree remove ../.worktrees/<name>`. Do **not** use
`~/Dev/personal/forestrie-wt/` (retired).

## Commands

- **Install**: `pnpm install`
- **UI dev**: `pnpm --filter @mandate/ui dev`
- **Tests**: `pnpm -r test` (per package)

## Documentation map

- **Plans**: [docs/plans/](docs/plans/)
- **ADRs**: [docs/adr/](docs/adr/)
- **Platform**: [../devdocs/](../devdocs/)
- **Cursor rules**: [branch-naming](.cursor/rules/branch-naming.mdc)
