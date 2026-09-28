/**
 * ORM-agnostic reset: truncate every data table in `public` in ONE statement
 * with `RESTART IDENTITY CASCADE`, so FK order is handled by CASCADE and
 * identity values restart per test.
 *
 * Each adapter passes a runner bound to its client plus the tables its
 * migration tool owns — wiping the migrations ledger corrupts the harness:
 *   TypeORM: `migrations`, `typeorm_metadata`
 *   Prisma:  `_prisma_migrations`
 *
 * Interim isolation: per-test transaction rollback is stronger, but needs the
 * app to resolve its DB client from something a test can bind a transaction to.
 */

export interface SqlRunner {
  query<T = Record<string, unknown>>(sql: string): Promise<T[]>;
  execute(sql: string): Promise<unknown>;
}

export async function truncateAll(
  sql: SqlRunner,
  preservedTables: ReadonlySet<string>,
): Promise<void> {
  const rows = await sql.query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
  );

  const tables = rows
    .map((row) => row.tablename)
    .filter((name) => !preservedTables.has(name));

  if (tables.length === 0) return;

  const quoted = tables.map((name) => `"public"."${name}"`).join(', ');
  await sql.execute(`TRUNCATE ${quoted} RESTART IDENTITY CASCADE`);
}
