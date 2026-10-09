# Genlexis

Genlexis is a SvelteKit application for building and using a validated corpus of generated sentences. It lets contributors review candidate sentences for correctness, plausibility, and appropriateness, then generate random lists from the accepted sentence set.

## Generation API

Researchers and server applications can call `POST /v1/generations` with an individually issued bearer key. The public guide is at `/api`; its downloadable OpenAPI contract is at `/api/openapi.yaml`. Requests support random and phoneme-balanced generation. Results are not stored, and a seed reproduces a result only while the corpus and generation rules remain unchanged.

Before issuing keys in an environment, apply `database/006-generation-api-keys.sql` there. Rehearse the migration on dev before production. This repository changes only the `genlexis` schema.

Keys are administered manually with Doppler-backed scripts:

```sh
pnpm api:keys:dev create "Research group"
pnpm api:keys:dev list
pnpm api:keys:dev revoke <key-id>
```

Use `api:keys:prod` for production after its migration. Keys use `glx_<64 hexadecimal characters>`. The create command displays the secret once; deliver it privately to the client. The database stores only its hash. Revoking a key takes effect on the next request.
