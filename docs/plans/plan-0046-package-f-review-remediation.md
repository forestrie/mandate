# plan-0046 — Package F review remediation

Status: **complete** (FOR-214 hygiene batch).

## Findings addressed

| ID | Finding | Remediation |
| -- | ------- | ----------- |
| F1 | FOR-109 semver blocked by cross-repo registry 405/403 | Git pin `delegation-cose-v0.1.1`; ADR-0004 updated (FOR-218 publish + cross-repo token limit) |
| F2 | FOR-118: reservation not cleared on unknown `logId` | `seenStore.clear` on `UnknownLogSignerError` (404) |
| F3 | FOR-118: success TTL implicit | `REQUEST_KEY_SUCCESS_TTL_SECONDS = 3600` on `markSeen` after submit |
| F4 | FOR-120: prod rate limit undocumented | `env.prod` 60/min (`namespace_id` 1003) in wrangler + `service-secrets.md` |
| F5 | FOR-137: ops rule not applied | devdocs ops-0012 application log + pending dashboard apply |

## PR stack

- mandate #25–#28 (Graphite: FOR-215 → FOR-119 → FOR-118 → FOR-120)
- devdocs #7–#8
- canopy #65 (delegation-cose v0.1.1 public publish)

## Follow-ups

- Org PAT or same-repo path for registry semver (FOR-109 reopen criteria).
- Manual Cloudflare edge rule apply per ops-0012 (FOR-137 sign-off).
