# plan-0044 — Kill-switch polish review remediation

**Status:** SHIPPED (FOR-194)  
**Date:** 2026-06-27  
**Related:** [FOR-194](https://linear.app/forestrie/issue/FOR-194),
[FOR-191](https://linear.app/forestrie/issue/FOR-191) (epic),
[plan-0043](plan-0043-kill-switch-polish.md)

Post-merge review remediations for Package B. All R-01..R-05 items and deferred
KS-05/06/07/08/12 findings addressed in `robin/for-194-revoke-hardening`.

## Shipped

| Item | Finding                           | Resolution                                                 |
| ---- | --------------------------------- | ---------------------------------------------------------- |
| R-01 | KS-01 clear-all bypass            | CLI routes all revokes through `revokeModeCWallet`         |
| R-02 | KS-02 deprecated no-id full clear | `mandateSignerId` required; deprecated path removed        |
| R-03 | KS-04 CLI test gap                | AT-R03-1 + expanded command module tests                   |
| R-04 | KS-09 ADR §5 drift                | Decision §5 + wallet table updated                         |
| R-05 | KS-11 DRY                         | Targeted path delegates to `removeMandateAdditionalSigner` |
| —    | KS-05 confirm-wallet-id only      | `--confirm-wallet-address` required in CI                  |
| —    | KS-06 exported API topology       | `removeMandateAdditionalSigner` asserts user-owned         |
| —    | KS-07 argv owner key              | CLI warns when `--owner-auth-key` on argv                  |
| —    | KS-08 retry semantics             | Runbook note in service-secrets.md                         |
| —    | KS-12 OPERATOR_ROOT_KEYS          | Helper emits orphan logId pruning hints                    |

## Deferred (intentional)

| ID    | Notes                                            |
| ----- | ------------------------------------------------ |
| KS-03 | Manual KEY_DIRECTORY rotation window — by design |

## Validation

```sh
pnpm --filter @mandate/privy-admin test
pnpm --filter @mandate/register test
pnpm lint && pnpm check && pnpm test
```
