# Mode B fork (agent index)

Purist BYOK user logs: user-operated remote signer, no `KEY_DIRECTORY` entry,
agent `bearerEnvKey` bearer routing.

**Canonical runbook:** [FORKING.md §5b](../../FORKING.md#5b--mode-b-user-log-purist-byok)

| Topic                           | Doc                                                                                                                         |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Reference signer Worker         | [packages/apps/reference-user-signer/README.md](../../packages/apps/reference-user-signer/README.md)                        |
| Remote bearer (`bearerEnvKey`)  | [ADR-0003 §5](../adr/adr-0003-delegation-signer-backend.md)                                                                 |
| Mode C → Mode B exit (same key) | [ADR-0005 exit step 3](../adr/adr-0005-byok-delegation-modes.md#operational-appendix--mode-c-kill-switch-and-exits-for-114) |
| Secrets catalog                 | [service-secrets.md](../service-secrets.md)                                                                                 |
| Live test                       | `task test:live:mode-b` ([FOR-210](https://linear.app/forestrie/issue/FOR-210))                                             |
| Opt-in UUPS root (§1 path C)    | [FORKING.md §1](../../FORKING.md#1--deploy-univocity-on-chain-anchor)                                                       |
