# Rules of the road — mandate (BYOK operator)

Operator-hosted Univocity instance management: operator UI, delegation agent,
signer, register/onboard. Load with [platform.md](https://github.com/forestrie/forestrie-agents/blob/main/rules-of-the-road/platform.md). `⤷` =
specialises a platform rule.

Glossary/links: [`arc-mandate` skill](https://github.com/forestrie/forestrie-agents/blob/main/arc-context/arc-mandate/SKILL.md). BYOK model:
[ARC-0022](https://github.com/forestrie/devdocs/blob/main/archive/2606/arc/arc-0022-byok-user-log-delegation-and-operator-hosted-sealing.md).

---

### M1 — The user's registered publicRoot is the sole root of trust
The user owns `K(L)` (or the Privy wallet whose key is `K(L)`); the operator
MUST NOT hold a long-lived user root in any mode. Security invariants I1–I8 hold.
**Why:** BYOK's whole promise is that operator compromise cannot forge or
rewrite the user's log.
⤷ specialises P6. [ARC-0022 §1–3](https://github.com/forestrie/devdocs/blob/main/archive/2606/arc/arc-0022-byok-user-log-delegation-and-operator-hosted-sealing.md).

### M2 — Mode C kill switch needs both bits; the user can always revoke
Sealing in Mode C requires **both** the user enable bit and the operator enable
bit; the user can unilaterally clear theirs and the operator cannot bypass it.
**Why:** the user must retain a unilateral stop even while the operator hosts the
sealing infrastructure.
[ARC-0022 §5](https://github.com/forestrie/devdocs/blob/main/archive/2606/arc/arc-0022-byok-user-log-delegation-and-operator-hosted-sealing.md).

### M3 — Protocol-level exit needs no operator cooperation
A user can re-assign `publicRoot` on-chain and re-delegate to a different sealer
without mandate's involvement. **Why:** an exit that depends on the operator is
not an exit — it is a lock-in.
[ARC-0022 §4.3](https://github.com/forestrie/devdocs/blob/main/archive/2606/arc/arc-0022-byok-user-log-delegation-and-operator-hosted-sealing.md).

### M4 — Payment identity is orthogonal to sealing authority
x402 / USDC payment identity MUST NOT be fed into grant verification, and grants
MUST NOT gate payment. Two planes. **Why:** coupling them would let a payment
lapse silently revoke authority (or vice-versa) — neither is the other's
authority source.
[ARC-0022 §3](https://github.com/forestrie/devdocs/blob/main/archive/2606/arc/arc-0022-byok-user-log-delegation-and-operator-hosted-sealing.md) · [arc-021 payment onboarding](https://github.com/forestrie/devdocs/blob/main/archive/2606/arc/arc-021-payment-onboarding/README.md).

### M5 — The delegation agent brokers; it never signs with a held root
`delegation.required` routes signing to the **user** signer in Mode B; the agent
mediates the exchange and validates returned certificates but holds no root key.
**Why:** the broker is a message router, not an authority — holding a key would
collapse M1.
⤷ specialises P6. [ARC-0022](https://github.com/forestrie/devdocs/blob/main/archive/2606/arc/arc-0022-byok-user-log-delegation-and-operator-hosted-sealing.md).

### M6 — Inline Safe deploy uses published deploy-core; deploy-web stays neutral
`/onboard`'s inline Safe branch (CreateCall / CREATE2) uses the published
`@forestrie/deploy-core` Safe client; deploy-web remains a neutral **EOA-only**
thin shell and STS is deploy-time best-effort only. **Why:** the structural fix
for MetaMask's no-`to` failure must not leak Safe/console logic into the neutral
shell.
[ADR-0060](https://github.com/forestrie/devdocs/blob/main/archive/2607/adr/adr-0060-inline-safe-deploy-in-mandate-console.md).
