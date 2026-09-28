// Prisma 7+: import from your generator's `output` path instead,
// e.g. '../../src/generated/prisma/client'.
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

import { getTestDatabaseUrl } from './test-database-url';

/**
 * The harness's own admin client (truncation only), bound explicitly to the
 * test URL. Specs use the app's `PrismaService`, not this.
 *
 * Prisma 7+ requires a driver adapter (below). On Prisma 5.2–6 without
 * adapters, use `new PrismaClient({ datasourceUrl: url })` instead.
 */
export function createTestPrismaClient(
  url: string = getTestDatabaseUrl(),
): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: url }),
  });
}
