---
name: arc-mandate
description: Mandate domain glossary (BYOK operator). Use when a task touches the BYOK operator UI, the delegation agent, or the mandate signer.
when_to_use: "Operator UI, session exchange, delegation signing, browser e2e, Privy auth in deploy-web."
user-invocable: false
---

# arc-context: mandate (BYOK operator)

Minimal glossary for **mandate** — BYOK Univocity instance management (operator
UI, delegation agent, signer, register).

**Load when:** operator UI, session exchange, delegation signing, browser e2e,
Privy auth in deploy-web.

**Do not bulk-read** — use [mandate/AGENTS.md](https://github.com/forestrie/mandate/blob/main/AGENTS.md).

---

## Core terms

| Term | Meaning |
|------|---------|
| **mandate** | Operator-hosted Univocity instance management product |
| **BYOK** | User owns root authority key `K(L)`; operator hosts sealing infra |
| **delegation agent** | Routes `delegation.required` to user signer in mode B |
| **@mandate/ui** | SvelteKit operator UI |
| **register** | Onboarding / instance registration flows |

## Authoritative docs

| Topic | Path |
|-------|------|
| Agent router | [AGENTS.md](https://github.com/forestrie/mandate/blob/main/AGENTS.md) |
| UI browser e2e plan | [docs/plans/plan-0047-ui-browser-e2e.md](https://github.com/forestrie/mandate/blob/main/docs/plans/plan-0047-ui-browser-e2e.md) |
| Delegation (platform) | [devdocs glossary — BYOK](https://github.com/forestrie/devdocs/blob/main/glossary.md) |
| Canopy delegation coordinator | [arc-canopy](../arc-canopy/SKILL.md) |

## Sibling repos

| Repo | Role |
|------|------|
| canopy | `@canopy/delegation-coordinator` Worker |
| univocity | On-chain checkpoint rules |
| arbor/custodian | KMS signing for operator-hosted keys |

## Gotchas

- **The delegation agent must accept a window-less `delegation.required`.**
  ADR-0050 §2 sends webhook signers the *same uniform* delivery as demand
  pendings — the standing delegate-key event carries **no** `mmrStart`/`mmrEnd`,
  and the signer chooses its own (conventionally `mmrStart = 0` plus a horizon).
  Treating the absent window as a missing field and rejecting the event means
  the log never gets an advance certificate and its checkpointing stalls.
  Submissions must also include the compact **on-chain signature**, or the
  lease has no `OnchainProof` and the publisher cannot publish that log's
  checkpoints (ADR-0050 review V3, coordinator C5). Same trap as the canopy
  e2e kit hit — see [arc-canopy](../arc-canopy/SKILL.md) Gotchas.
