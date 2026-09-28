## Project profile (for `tanstack-query-data-layer` and `fullstack-testing`)

<!-- Paste into the project's AGENTS.md and fill in. Delete lines that do not apply.
     This block wins over the skills wherever they disagree. -->

### Stack

- ORM: typeorm | prisma  (Prisma major version: …; client import path: …)
- Migrations: generate `…`, apply `…`

### Paths

- HTTP client: `apps/frontend/lib/api/http.ts`
- Query key factory: `apps/frontend/lib/api/queryKeys.ts`
- QueryClient defaults: `apps/frontend/providers/index.tsx`
- Feature hooks: `apps/frontend/features/<feature>/hooks/`
- Integration harness: `apps/api/test/integration/` (core + the typeorm or prisma adapter)
- DB provider: `PrismaService` at `…` / `TypeOrmModule` in `…`
- Factories: `apps/api/test/integration/factories/`
- Playwright utils: `apps/e2e/tests/utils/`

### Commands

- API unit: `yarn workspace <api> test`
- API integration: `yarn workspace <api> test:integration`
- Frontend: `yarn workspace <frontend> test`
- E2E (needs the dev stack): `yarn workspace <e2e> test`
- Does root `yarn test` include Playwright? yes / no
- Is `test` cached by Turbo/Nx? yes / no (if yes: `--force` after non-file changes)

### Environment

- Integration DB resolution order: `TEST_DATABASE_URL` → (`CI` && `DATABASE_URL`) → Testcontainers
- Postgres version in production: 16
- Auth mechanism the E2E suite seeds: session cookie / bearer token
- Auth rate limits that constrain E2E: e.g. sign-in 5/min/IP

### Exceptions and known debt

- Legacy patterns not to copy (e.g. "N spec files stub repositories — legacy, not precedent")
- Architecture guard specs that enforce these rules: …
