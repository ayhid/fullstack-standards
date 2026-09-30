---
name: fullstack-testing
description: Testing conventions for a Vite + React + TanStack Query frontend talking to any REST backend (NestJS or Strapi), a NestJS + Postgres API on any ORM (TypeORM and Prisma adapters included), and a Playwright E2E suite — which layer a test belongs in, hooks tested only through components with the frontend service mocked, services tested against the single API entry point, third-party services (Brevo, Stripe, S3…) always mocked at their port and never tested themselves, the real-Postgres integration harness, typed factories, and Playwright rules (route mocking, worker-unique data, web-first waits). Use before writing, changing, or debugging any test, or when deciding what coverage a fix needs.
---

# Full-stack testing

Before applying anything here, look for a **project profile** (usually in the project's
`AGENTS.md`) and the project's `TESTING.md`. They give real paths, commands and known
debt, and win wherever they disagree with this skill.
No profile? Suggest creating one with the `project-profile` skill; meanwhile run its
detector read-only (`project-profile/scripts/detect-profile.mjs .`) for the facts.

## Pick the layer — push each test as far down as it will go

| Layer                | Files                         | Runner                       | Owns                                                          |
| -------------------- | ----------------------------- | ---------------------------- | ------------------------------------------------------------- |
| API unit             | `*.spec.ts`                   | Jest                         | Pure logic: guards, policies, mappers, validation, branching  |
| API integration      | `*.integration-spec.ts`       | Jest, **real Postgres**      | Anything that depends on the schema: queries, transactions, FKs, migrations |
| API HTTP (optional)  | `test/**/*.e2e-spec.ts`       | Jest + supertest             | Database-free HTTP surface: guards, pipes, status codes       |
| Frontend components  | `*.test.tsx`                  | Vitest + RTL + jsdom         | Components **and the hooks they use**, a11y; the feature service mocked |
| Frontend services    | `*.service.test.ts`           | Vitest                       | The `apiClient.request` config each service sends, and its mapping |
| Frontend API client  | `client.test.ts`              | Vitest, `fetch` stubbed      | Transport only: serialisation, retries, refresh, errors       |
| Browser E2E          | `e2e/tests/**/*.spec.ts`      | Playwright                   | Cross-stack user journeys                                     |

A rule provable in a unit spec does not belong in a journey. A query that depends on
the schema does not belong in a mocked unit spec.

**Coverage lives on the layer that can observe the failure.** A route-mocked browser
spec proves what the frontend *sends*; it cannot fail on a server bug. A server defect
needs an API-layer spec. When claiming coverage, name the layer, and never credit a
mocked browser spec with the API spec's work.

## The non-negotiables

1. **Do not mock the database.** Mock only third-party services, the way rule 10 says.
   A stubbed repository or deep-mocked Prisma client
   asserts the shape of your mock, not the schema. → `references/api-integration.md`
2. **The test schema comes from the real migration chain** (`migration:run` /
   `prisma migrate deploy`), never `synchronize` or `db push`. The harness is an
   ORM-free core plus one adapter per ORM; pick the adapter from the project profile,
   or from `prisma/schema.prisma` vs `@nestjs/typeorm`.
3. **Seed with typed factories, never shared JSON fixtures.** Never assert against a
   generated literal; assert against the created entity's own field.
4. **Never test a hook directly** (no `renderHook` on a feature hook). Test it through
   a component: real `QueryClient`, real hook, the feature's **service module mocked**.
   For every branch, assert which service function ran, with which arguments and how
   often, and what the user sees. **Test services by mocking the single entry point**
   (`apiClient.request`) and asserting the exact `{ method, path, query, body }` and the
   mapped result. → `references/frontend-vitest.md`
5. **Never stub a form field that carries `required`** in a test that asserts a submit
   happens; native validation blocks submit before React sees it. Assert
   `form.checkValidity()` or drive the real field.
6. **Playwright specs stub the API with `page.route`** unless mocking would make the
   assertion vacuous; waits are web-first, never `waitForTimeout`. →
   `references/playwright.md`
7. **No wall-clock latency assertions** in any layer.
8. **Jest on the API (`jest.fn()`), Vitest on the frontend (`vi.fn()`).** Not
   interchangeable.
9. **Checks against a running app are committed specs** (mocked or HAR-replayed), not
   one-off curl or browser probes.
10. **Third-party services are always mocked, and never tested themselves.** Each
    provider (Brevo, Stripe, S3, Sentry, an LLM API) sits behind a port and one adapter.
    Consumer specs mock the **port** and assert that it is called with the exact params
    (or not called), and that the right exception is raised on each failure — or
    deliberately not, for a best-effort call. The adapter's spec passes a fake SDK client
    and asserts the payload and the error translation. No spec `jest.mock`s an SDK or
    reaches the network. → `references/third-party-services.md`

## Traps worth knowing up front

- A harness that falls back to `DATABASE_URL` when `CI` is truthy will truncate
  whatever that points at — including a `CI` exported in your local shell. Never point
  it at a database you want to keep.
- `CI=false` in a `.env` is the **string** `"false"` — truthy. It silently turns on CI
  retries and workers locally.
- Build caches (Turbo/Nx) replay a green `test` after an environment-only fix. Force a
  re-run.
- Architecture rules are best enforced by **guard specs** that parse the source (TS AST,
  not grep) and fail with a pointer to the convention. → `references/guard-specs.md`

## References and templates

| File                                     | Covers                                                  |
| ---------------------------------------- | ------------------------------------------------------- |
| `references/api-unit.md`                 | Jest config traps, what a unit spec may stub            |
| `references/api-integration.md`          | Harness design, isolation, factories, provider overrides, external Postgres |
| `references/third-party-services.md`     | Port + adapter, what each spec mocks, required vs best-effort exceptions |
| `references/frontend-vitest.md`          | Component tests, service tests, cache bugs, doubles     |
| `references/playwright.md`               | Auth, route mocking, worker-unique data, tags, HAR       |
| `references/guard-specs.md`              | Enforcing architecture with specs                        |
| `references/ci.md`                       | What CI should run and in which order                    |
| `templates/api-integration/core/`        | ORM-free harness: container, global setup/teardown, truncate, URL guard |
| `templates/api-integration/typeorm/`     | TypeORM adapter: migrations, data source, module, factories, example spec |
| `templates/api-integration/prisma/`      | Prisma adapter: migrate deploy, client, module, factories, example spec |
| `templates/frontend/*`                   | `renderWithClient`, component specs (invalidation, form and list branches, bulk delete), service spec, query-key and API-layering guards |
| `templates/third-party/*`                | Mailer port, Brevo adapter + spec, consumer service + spec, SDK import guard |
| `templates/e2e/*`                        | Worker-scoped names, catch-all route guard               |
