# TypeORM specifics

- Inject `Repository<Entity>` with `@InjectRepository(Entity)`; register it with
  `TypeOrmModule.forFeature([...])` in the module.
- Keep entity registration in **one** list. If the app registers entities in several
  places (per-connection `entities` arrays, `forFeature`, the test harness), they drift,
  and `autoLoadEntities: true` hides the drift at runtime until a code path needs a
  missing repository.
- `synchronize: false` everywhere, including tests. Migrations own the schema.
- Transactions: `this.dataSource.transaction(async manager => …)`; helpers take the
  `EntityManager`. `manager.getRepository(E)` inside, never `this.repo`.
- Use the query builder for dynamic filters and `getManyAndCount()` for pagination.
  Interpolate only whitelisted column names; values always go through parameters
  (`:search`).
- Nullable columns: declare the property as `string | null` so the type matches the
  schema, and remember a migration that relaxes `NOT NULL` also changes what the
  frontend must render defensively.
- Error mapping in the global filter: `QueryFailedError` with `driverError.code`
  `23505` (unique) → 409, `23503` (FK) → 400; `EntityNotFoundError` → 404.
