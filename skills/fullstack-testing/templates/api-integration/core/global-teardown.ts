import type { TestDatabase } from './postgres-container';

/**
 * Jest globalTeardown — stops the Testcontainers Postgres started in
 * global-setup. No-op when an external database was supplied.
 */
export default async function globalTeardown(): Promise<void> {
  const db = (globalThis as unknown as { __TEST_DB__?: TestDatabase })
    .__TEST_DB__;
  await db?.stop();
}
