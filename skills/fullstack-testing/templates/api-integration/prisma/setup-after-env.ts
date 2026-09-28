import type { PrismaClient } from '@prisma/client';

import { getTestDatabaseUrl } from './test-database-url';
import { createTestPrismaClient } from './test-prisma-client';
import { REFERENCE_TABLES } from './reference-data';
import { truncateAll } from './truncate';

/**
 * Point the app's own client at the harness database. This file runs before
 * each spec's imports, so any `PrismaService` / `PrismaClient` a spec builds
 * reads this URL — never the developer's `DATABASE_URL`. Throws (via
 * `getTestDatabaseUrl`) when the harness did not provision a database.
 */
process.env.DATABASE_URL = getTestDatabaseUrl();

/** The migration ledger (wiping it corrupts the harness) and reference data. */
const PRESERVED_TABLES = new Set([
  '_prisma_migrations',
  ...REFERENCE_TABLES,
]);

/**
 * One admin client per file, used only to reset state after every test. It is
 * deliberately a bare client: truncation must bypass app extensions.
 * `maxWorkers: 1` makes sharing it safe.
 */
let adminPrisma: PrismaClient;

beforeAll(async () => {
  adminPrisma = createTestPrismaClient();
  await adminPrisma.$connect();
});

afterEach(async () => {
  await truncateAll(
    {
      query: (sql) => adminPrisma.$queryRawUnsafe(sql),
      execute: (sql) => adminPrisma.$executeRawUnsafe(sql),
    },
    PRESERVED_TABLES,
  );
});

afterAll(async () => {
  await adminPrisma?.$disconnect();
});
