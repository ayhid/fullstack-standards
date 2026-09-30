# Backend services

Rules for the NestJS service layer that hold whatever the ORM is. ORM-specific
mechanics live in `orm/<orm>.md`; read the one the project profile names
(`orm: typeorm | prisma`). No profile? Detect it: `prisma/schema.prisma` → Prisma;
`@nestjs/typeorm` in `package.json` → TypeORM.

| Concern              | TypeORM                                  | Prisma                                         |
| -------------------- | ---------------------------------------- | ---------------------------------------------- |
| Data access in a service | `@InjectRepository(E) repo: Repository<E>` | `PrismaService` (extends `PrismaClient`)   |
| Transaction handle   | `EntityManager` from `dataSource.transaction` | `tx` from `prisma.$transaction(async tx => …)` |
| Schema source of truth | Migration files                        | `schema.prisma` + `prisma/migrations/`         |
| Generate a migration | `typeorm migration:generate`             | `prisma migrate dev --create-only`             |
| Apply in prod/tests  | `typeorm migration:run`                  | `prisma migrate deploy`                        |
| Never in tests/prod  | `synchronize: true`                      | `prisma db push`                               |
| Service template     | `templates/backend/typeorm/`             | `templates/backend/prisma/`                    |

## Shape

- **Controller:** routing, guards, DTO validation, status codes. No business logic.
- **Service:** business rules, orchestration, transactions. Talks to the ORM directly.
- **Repository class:** only when a resource has non-trivial *reusable* query logic.
  Not for symmetry: `Repository<T>` and `PrismaClient` are already data layers.
- Public methods first, private helpers below.

## Rules

1. **Throw Nest HTTP exceptions from services** (`NotFoundException`,
   `BadRequestException`, `ConflictException`) so one global filter shapes the error
   response. Map ORM errors there too (unique violation → 409, FK violation → 400,
   not found → 404) rather than in each service.
2. **Parse ids strictly.** Accept `/^\d+$/` then `Number(...)`; never `parseInt`
   (`parseInt("1e3")` is 1, `Number("1e3")` is 1000). A bad id is a 400/403, never a
   silent fallback. Prefer `ParseIntPipe` at the controller.
3. **Multi-row writes go in one transaction**, and every helper the transaction calls
   takes the **transaction handle**, not the injected client/repo. Using the injected
   one silently runs outside the transaction.
4. **List endpoints return `{ data, meta: { page, pageSize, total, totalPages } }`**, and
   whitelist `sortBy` against known fields before it reaches the query.
5. **Update DTOs are `PartialType(CreateDto)`.** Optional user-input strings are trimmed
   to `undefined` so blanks persist as `NULL`, not `''`.
6. **Do not return ORM types on the wire.** Request/response shapes live in the
   shared-types package when there is one; ORM entities/models are internal. (Prisma
   models carry `Decimal`, `BigInt` and `Date`, none of which survive JSON unchanged.)
   Pin shared wire types with type-equality assertions in `*.spec.ts` only.
7. **Never re-declare an enum** that already exists (shared-types or ORM-generated). TS
   enums are nominal; a byte-identical copy is a different type.
8. **Never edit an applied migration.** Generate a new one; keep it additive and
   idempotent where the deploy can run the chain more than once.
9. **A service never imports a third-party SDK.** It injects a port (`@Inject(MAILER)
   mailer: Mailer`), one adapter per provider holds the SDK and its credentials, and the
   service maps the port's error to a Nest exception, or logs it when the call is
   best-effort. Templates and tests: `fullstack-testing/references/third-party-services.md`.

## Testing services

Anything that touches the schema is an **integration test on a real Postgres**, never
a unit test with a stubbed repository or a deep-mocked Prisma client. See the
`fullstack-testing` skill; its harness has a TypeORM and a Prisma adapter.
