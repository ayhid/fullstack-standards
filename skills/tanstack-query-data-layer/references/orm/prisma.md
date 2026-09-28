# Prisma specifics

- One `PrismaService extends PrismaClient implements OnModuleInit` (call `$connect()`
  in `onModuleInit`), provided by a `PrismaModule`. Services inject `PrismaService`.
- **Prisma 7+** needs a driver adapter (`new PrismaClient({ adapter: new PrismaPg({
  connectionString }) })`), a generator `output` path you import the client from, and
  the connection URL in `prisma.config.ts`. **Prisma ≤6** imports from
  `@prisma/client` and reads the URL from `schema.prisma`. The project profile says
  which.
- **Migrations:** generate with `prisma migrate dev --create-only`, review the SQL,
  commit. Deploy and tests run `prisma migrate deploy`. Never `db push` outside a
  throwaway prototype: it skips the migration history.
- Regenerate the client (`prisma generate`) in `postinstall` or the build, so CI and
  Docker builds never compile against a stale client.
- **Transactions:** interactive `prisma.$transaction(async tx => …)` for logic that
  reads then writes; the array form `$transaction([a, b])` for independent queries
  (e.g. `findMany` + `count` for pagination). Helpers take `Prisma.TransactionClient`.
- Use generated input types (`Prisma.TaskWhereInput`, `Prisma.TaskUncheckedCreateInput`)
  instead of hand-written shapes. Whitelist `orderBy` field names from the client.
- `findUnique` + explicit `NotFoundException` reads better than catching `P2025` from
  `findUniqueOrThrow`/`update`, but map the codes in the global filter anyway:
  `P2002` (unique) → 409, `P2003` (FK) → 400, `P2025` (not found) → 404.
- **Do not serialise models straight to the wire:** `Decimal` becomes a string object,
  `BigInt` throws in `JSON.stringify`. Map to the shared DTO.
- Prisma enums are generated. Import them from the client; do not re-declare them in
  shared-types. If the frontend needs them, re-export from one place.
- **Prisma queries are lazy (`PrismaPromise`): they run when awaited, not when
  called.** Anything that relies on `AsyncLocalStorage` (tenant-isolation extensions,
  request-scoped audit) sees the context of the *await*, not the call. Never return an
  un-awaited query out of `store.run(ctx, …)` or a similar context boundary.
- Extensions (`$extends`) return a new client. If `PrismaService` installs one, every
  consumer (including tests) must go through `PrismaService`, never a fresh
  `new PrismaClient()`, or the extension is silently skipped.
- Avoid `$queryRawUnsafe` in application code. `$queryRaw` with a tagged template
  parameterises for you.
