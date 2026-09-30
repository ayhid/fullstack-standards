# API unit tests (Jest)

## What belongs here

Pure logic with no schema dependency: guards, CASL/policy rules, mappers, DTO
validation, pipes, service branching where every collaborator is non-DB (or the DB call
is irrelevant to the rule under test).

## What a unit spec may stub

- Third-party services, **at their port** (`{ provide: MAILER, useValue: mailer }`),
  never by `jest.mock`-ing the SDK. Assert the call's params and the exceptions raised.
  → `third-party-services.md`
- Other services, when the rule under test is this service's branching.
- **Not** the data layer, to prove data behaviour: no stubbed `Repository<T>` /
  `DataSource` / query builder (TypeORM), no `mockDeep<PrismaClient>()` or hand-built
  `prisma.task.findMany` mocks (Prisma). If the assertion is about what ends up in the
  database or what a query returns, it is an integration spec. Existing specs that stub
  the data layer are legacy, not precedent.

## Config traps (Jest)

- **Pick one naming convention for integration specs and make the other fail loudly.**
  With `*.spec.ts` for unit and `*.integration-spec.ts` for integration, a file named
  `*.integration.spec.ts` can end up collected by *neither* project and never run. Add a
  guard spec that walks `src/` and `test/` and fails naming any mis-suffixed file.
- `collectCoverageFrom: ['!**/*.spec.ts']` does **not** exclude `*.integration-spec.ts`
  (different separator). Exclude it explicitly, or a co-located integration spec counts
  as uncovered source and drops the global percentage.
- A low global coverage threshold is a regression floor, not a target. Do not raise it
  in an unrelated change.

## Guard wiring

For each protected controller, pin both halves:

- **Metadata:** a unit spec asserting the guards/roles decorators are on each route
  (`Reflector` / `Reflect.getMetadata`).
- **Behaviour:** an HTTP spec booting only the controller, with a mocked service, that
  denies each guard in turn and asserts the status code.

## Style

One behaviour per `it`, named as a sentence about the behaviour. Arrange with explicit
values next to the assertion. No `setTimeout`-based waits and no latency assertions.
