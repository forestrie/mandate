# @mandate/reference-user-signer

Reference **Mode B user remote signer** Cloudflare Worker. Holds a local KS256
root key per log and implements ADR-0003 `POST /v1/sign` with **`USER_SIGNER_BEARER`**
auth (distinct from mandate-operated `@mandate/signer`).

Use this as a dev/e2e stand-in for a user-operated signing endpoint. Production
Mode B users run their own KMS/HSM bridge with the same contract.

## Secrets

| Binding                 | Purpose                                                             |
| ----------------------- | ------------------------------------------------------------------- |
| `USER_SIGNER_BEARER`    | Bearer token for `Authorization` header                             |
| `USER_SIGNER_KEYS_JSON` | `{ "<logId>": { "privateKeyHex", "rootSignerAddress", "keyRef" } }` |

See [docs/service-secrets.md](../../../docs/service-secrets.md).

## Local dev

```sh
cp .dev.vars.example .dev.vars
pnpm --filter @mandate/reference-user-signer dev
```

## Tests

```sh
pnpm --filter @mandate/reference-user-signer test
```

## Deploy

```sh
task deploy:reference-user-signer
```

Set `E2E_USER_SIGNER_URL` in Doppler `e2e` to the deployed `…/v1/sign` base URL
(parent origin + `/v1/sign` path used by agent `OPERATOR_ROOT_KEYS`).

## Agent wiring (Mode B)

`OPERATOR_ROOT_KEYS` entry:

```json
{
	"<logId>": {
		"alg": "KS256",
		"rootSignerAddress": "0x…",
		"kind": "remote",
		"signerUrl": "https://mandate-reference-user-signer.<account>.workers.dev/v1/sign",
		"keyRef": "user-remote",
		"bearerEnvKey": "USER_SIGNER_BEARER"
	}
}
```

Agent Worker must have `USER_SIGNER_BEARER` secret set to match this signer's bearer.
