# API integration tests (real Postgres)

## Harness layout: core + one ORM adapter

```
templates/api-integration/
  core/        postgres-container.ts  global-setup.ts  global-teardown.ts  reference-data.ts
               truncate.ts  test-database-url.ts  jest-integration.json
  typeorm/     run-migrations.ts  test-data-source.ts  setup-after-env.ts
               test-module.ts  factories/  tasks.service.integration-spec.ts
  prisma/      run-migrations.ts  test-prisma-client.ts  setup-after-env.ts
               test-module.ts  factories/  tasks.service.integration-spec.ts
```

Copy `core/*` **and** the one adapter the project uses (profile `orm:`, or detect it:
`prisma/schema.prisma` → Prisma, `@nestjs/typeorm` → TypeORM) into
`<api>/test/integration/`, flat. Move `jest-integration.json` to `<api>/test/`. Run with
`jest --config ./test/jest-integration.json --runInBand`.

The core never imports an ORM. An adapter supplies four things: `runMigrations(url)`,
an admin client for `setup-after-env`, the tables its migration tool owns (preserved
by truncation), and a `createIntegrationTestingModule` that binds the app's DB provider
to the test database. **Adding another ORM (Drizzle, MikroORM, Kysely) means writing
those four files, nothing else.**

| Adapter  | Migrations run by           | Preserved tables                     | DB provider overridden |
| -------- | --------------------------- | ------------------------------------ | ---------------------- |
| TypeORM  | `typeorm migration:run`     | `migrations`, `typeorm_metadata`     | `TypeOrmModule.forRoot(testDataSourceOptions())` |
| Prisma   | `prisma migrate deploy`     | `_prisma_migrations`                 | none: the real `PrismaService`, with `DATABASE_URL` pointed at the test DB in `setup-after-env` |

**Bind the app's real DB provider to the test database; never substitute a bare
client.** Extensions and middleware installed in the provider (tenant isolation, soft
delete, auditing) are behaviour under test. A bare client skips them silently, and the
spec passes against code production never runs. Only the admin client that truncates is
bare, on purpose.

## How the database is provisioned (core)

`global-setup` resolves a URL in this order and publishes it as `TEST_DATABASE_URL` for
every worker:

1. `TEST_DATABASE_URL`, if set (explicit opt-in).
2. `DATABASE_URL`, if `CI` is set (reuses the CI Postgres service container).
3. Otherwise Testcontainers starts `postgres:<prod major>-alpine` with the data dir on
   **tmpfs**. Pin the image to production's major version.

Then it runs the adapter's `runMigrations` — the **same command production runs**.
Never `synchronize` (TypeORM) or `db push` (Prisma): the schema under test must be
exactly what migrations produce, so a broken migration fails here instead of at deploy.

> **The harness owns the database you give it.** It migrates it and truncates every
> table after each test. Only point it at a throwaway database. Step 2 fires on *any*
> truthy `CI`, including one exported in a local shell.

`getTestDatabaseUrl()` **throws** when `TEST_DATABASE_URL` is unset, so an integration
spec run outside this Jest project fails instead of connecting somewhere. Adapters build
their clients from it, never from the app's `DATABASE_URL`. Prefer
`TEST_DATABASE_URL=… yarn …` inline over exporting it in your shell profile.

## Reference data

Catalogue and lookup tables the app expects to exist (a fixed dimension catalogue,
countries, plan tiers) do not survive per-test truncation. A spec that seeds them in
`beforeAll` passes its first test and fails the rest. Declare them in
`reference-data.ts`: `seedReferenceData(url)` runs once in global setup (reuse the
app's own seed function), and `REFERENCE_TABLES` are left out of truncation.

Only for tables no spec writes to, and only for tables with **no FK to a truncated
table**: `TRUNCATE … CASCADE` follows FKs into truncated tables and would empty them anyway.

**`globalSetup` runs outside Jest's module system.** It has no `moduleNameMapper` or
transform aliases, so an import there (e.g. the app's seed file importing a workspace
package) resolves through plain Node, to the package's built `dist/`. Build workspace
packages first (a fresh clone or worktree has none), or run the seed as a child process
with the project's own seed command.

## Isolation

`setup-after-env` opens one admin client per file and, in `afterEach`, truncates every
table in `public` in **one** statement with `RESTART IDENTITY CASCADE`, preserving the
adapter's migration tables. `maxWorkers: 1` makes the shared connection safe.

Per-test transaction rollback is stronger, but only works if the app resolves its DB
client from something a test can bind a transaction to. Until then, truncation — so a
test may not rely on data from a previous test, and identity sequences restart.

## Writing one

- Co-locate: `src/tasks/tasks.service.integration-spec.ts`. Specs that belong to no
  single provider (migration replays) go under `test/integration/`.
- Boot a **minimal** module with `createIntegrationTestingModule({ providers, controllers,
  guardOverrides, providerOverrides })`: real DB + only what is under test, so a service
  spec does not drag in cache, schedulers or storage. Guard stubs go on the builder,
  before `compile()`.
- **Third-party ports are always mocked**, here too. The database is real; the mailer is
  not:

  ```ts
  const mailer: jest.Mocked<Mailer> = { sendInvitation: jest.fn(), sendInvitationReminder: jest.fn() };
  const moduleRef = await createIntegrationTestingModule({
    providers: [MembersService, mailerProvider],
    providerOverrides: [[MAILER, mailer]], // the real adapter and SDK are never built
  });
  ```

  Assert the call **and** the rows: a required email that fails must leave no member
  behind (or one flagged as not invited), whichever the service promises. →
  `third-party-services.md`
- TypeORM: keep the harness entity list in sync with the app's registration.
  Prisma: nothing to sync, but regenerate the client after schema changes.
- Assert **by row count and row content**, read back through the client, not by trusting
  the service's return value.
- Slow specs (migration replays) raise their own timeout (`jest.setTimeout(120_000)`).
- Testing request-scoped behaviour (tenant isolation, current user) that the DB
  provider reads from `AsyncLocalStorage`: **await the query inside the context
  callback**. Prisma queries are lazy; returning an un-awaited `PrismaPromise` from
  `store.run(ctx, () => prisma.x.findMany())` runs it after the context has exited, and
  the spec "proves" the extension does nothing. Use `run(ctx, async () => await fn())`.
- Existing specs that ran against a shared dev database with hand-rolled cleanup usually
  run unchanged on the harness once their reference data is declared; the cleanup
  becomes redundant and can be deleted.

## Factories

`<adapter>/factories/` — same contract for every ORM:

- Signature `(db, overrides)`, where `db` is the client **or** a transaction handle
  (TypeORM `EntityManager`, Prisma `TransactionClient`), so factories work inside a
  transaction.
- Fill only what required columns / FKs need, plus one identifying column.
- **Auto-create missing FK parents**: `createTask(db)` gives customer → project → task;
  `createTask(db, { projectId })` attaches to an existing one. (Prisma: type overrides as
  `*UncheckedCreateInput` so scalar FKs are accepted.)
- Unique values come from a per-process `nextId()` counter. Never assert against the
  literal it produced; capture the entity and assert its own field.
- No factory for your entity? **Add one** instead of inlining creates in the spec.
- No shared JSON fixture files.

## Pointing at an external Postgres (no Docker)

Requirements the container satisfies silently but yours might not:

- Point at an **empty** database (`DROP SCHEMA public CASCADE; CREATE SCHEMA public;`).
- The role needs **`CREATEDB`** if migration specs create scratch sibling databases
  (Prisma's `migrate dev` also wants it for its shadow database; `migrate deploy` does not).
- Server **≥ 13** if you use `DROP DATABASE … WITH (FORCE)`.
- On **15+**, the role must own the DB or be granted `CREATE` on `public`.
- A killed run can leak scratch databases; list them by their prefix and drop by hand.
- Use a URL-form connection string, not a libpq `key=value` DSN.
