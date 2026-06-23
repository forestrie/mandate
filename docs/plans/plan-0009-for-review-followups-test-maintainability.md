# plan-0009 — Kill-switch review follow-ups (test + maintainability)

Tracks post-implementation review remediation for Mode C kill switch (FOR-114,
FOR-117, FOR-115, FOR-128). Security gaps treated as intermediate-state artifacts
unless filed as distinct Linear issues (FOR-129–FOR-132).

## Scope

### Maintainability

- [x] ADR-0005 operator vs operator-assisted labels + implementation status table
- [x] Fix `assertMandateAbsentFromAdditionalSigners` mandate-only branch
- [x] Revoke pre-check + `{ revoked, hadMandateSigner }` output
- [x] Live CI preflight job (`live-secrets-check`); Doppler ↔ GitHub sync for `live-signer`
- [x] UI kill-switch card comment (operator BFF auth)

### Tests

- [x] Negative revoke unit tests (ownerless, PATCH 403, mandate absent pre-check)
- [x] Register CLI smoke (`revoke-mode-c` help + missing env exit 1)
- [x] UI `buildSubmitMaterialBody` locks `delegatedPublicKey` from entry
- [x] Hands-off live: revoke → agent 502 → restore → success (Mode C wallet)
- [x] Live CI preflight job (`live-secrets-check`)

### Linear

- [x] FOR-129 per-user coordinator BFF auth
- [x] FOR-130 targeted mandate additional-signer removal
- [x] FOR-131 post-revoke KEY_DIRECTORY hygiene
- [x] FOR-132 revoke CLI safety guardrails
- [x] FOR-114 / FOR-128 cross-links from review

## Validation

```sh
pnpm --filter @mandate/privy-admin test
pnpm --filter @mandate/register test
pnpm --filter @mandate/agent test
pnpm --filter @mandate/ui test
doppler run --project mandate-forestrie --config dev -- \
  pnpm --filter @mandate/agent test:live:hands-off
gh workflow run live-owned-wallet.yml --repo forestrie/mandate
```

## References

- [ADR-0005 operational appendix](../adr/adr-0005-byok-delegation-modes.md#operational-appendix--mode-c-kill-switch-and-exits-for-114)
- [plan-0008 FOR-114 kill switch](plan-0008-for-114-mode-c-kill-switch.md)
- [service-secrets.md](../service-secrets.md) — live wallet matrix; [ADR-0006](../adr/adr-0006-privy-secrets.md) naming
