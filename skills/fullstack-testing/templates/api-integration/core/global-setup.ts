import { startTestDatabase, TestDatabase } from './postgres-container';
import { seedReferenceData } from './reference-data';
import { runMigrations } from './run-migrations';

/**
 * Jest globalSetup — runs once before the whole integration suite.
 *
 *   1. Provision a real Postgres (Testcontainers locally, or a CI service
 *      container via TEST_DATABASE_URL / DATABASE_URL).
 *   2. Create the schema by running the real migration chain.
 *   3. Seed reference data once (see reference-data.ts).
 *   4. Publish the connection string on process.env so every worker (forked
 *      after this hook) inherits it, and stash the handle for teardown.
 */
export default async function globalSetup(): Promise<void> {
  const started = Date.now();
  const db: TestDatabase = await startTestDatabase();

  process.env.TEST_DATABASE_URL = db.url;
  // Expose the container handle to global-teardown (same parent process).
  (globalThis as unknown as { __TEST_DB__?: TestDatabase }).__TEST_DB__ = db;

  runMigrations(db.url);
  await seedReferenceData(db.url);

  console.log(
    `\n[integration] Postgres ready + migrated in ${Date.now() - started}ms\n`,
  );
}
