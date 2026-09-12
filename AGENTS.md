# Genlexis — notes for agents

SvelteKit app on Cloudflare Workers, Neon PostgreSQL through Drizzle, secrets through Doppler
(`doppler run -p genlexis -c {dev|test|prod|stg}`; use the package scripts).

## The application database is shared with Helixum

The Neon database behind `PRIVATE_DATABASE_URL` is also the one the Helixum repository uses
(its `specs/shared-database-ownership.md` is the reference). Ownership is by PostgreSQL schema:
**this repository owns `genlexis` only** (corpus, classifications, material draws, its
`lang_code` enum). `app`, `aud`, `auth` and `media` belong to Helixum and must not be declared,
read or written from here.

Rules: `drizzle.config.ts` keeps `schemaFilter: ['genlexis']`, which is what makes `pnpm db:push`
safe — never widen it; never declare a table outside `genlexis`
(`src/lib/server/db/schema.spec.ts` fails). Structural changes that `push` cannot express safely
go in `database/00x-*.sql`, rehearsed on dev before prod.

## Git

CI (`.github/workflows/ci-deploy.yml`) deploys on **any** push. Push work as
`git push origin HEAD:master` once the pre-push hook passes; never push a feature branch.
