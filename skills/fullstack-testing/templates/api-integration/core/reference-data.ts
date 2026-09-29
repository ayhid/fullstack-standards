/**
 * Reference data: catalogue / lookup tables the app expects to exist (country
 * lists, a fixed dimension catalogue, plan tiers). Seeded ONCE by global-setup
 * after migrations, and preserved by the per-test truncation.
 *
 * Rules:
 *   - Only tables no spec writes to. A spec that mutates one leaks into every
 *     later spec — seed that data per test with a factory instead.
 *   - A reference table must not hold a FK to a truncated table:
 *     `TRUNCATE … CASCADE` follows FKs *into* the truncated tables and would
 *     empty it anyway.
 *   - Seed with the app's own seed function where one exists, so tests and
 *     environments agree on the catalogue.
 *
 * Leave both exports empty when the app has no reference data.
 */

/** Table names as they appear in `pg_tables` (Prisma: the model name, or its `@@map`). */
export const REFERENCE_TABLES: readonly string[] = [];

export async function seedReferenceData(_databaseUrl: string): Promise<void> {
  // Build the client with the adapter's own factory so it matches your ORM version.
  // e.g. Prisma (../prisma/test-prisma-client):
  //   const prisma = createTestPrismaClient(databaseUrl);
  //   try { await seedCatalogue(prisma); } finally { await prisma.$disconnect(); }
  // e.g. TypeORM (../typeorm/test-data-source):
  //   const dataSource = await createTestDataSource(databaseUrl).initialize();
  //   try { await seedCatalogue(dataSource); } finally { await dataSource.destroy(); }
}
