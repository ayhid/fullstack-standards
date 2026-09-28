import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';

/**
 * Postgres image used for integration tests. Pinned to match production
 * (PostgreSQL 16). Override with TEST_POSTGRES_IMAGE if a runner needs a
 * pre-pulled tag.
 */
const POSTGRES_IMAGE = process.env.TEST_POSTGRES_IMAGE ?? 'postgres:16-alpine';

export type TestDatabase = {
  url: string;
  /** Stops the container. No-op when an external database was supplied. */
  stop: () => Promise<void>;
};

/**
 * Returns an externally-provided connection string when one is available so we
 * can skip the image pull:
 *   - TEST_DATABASE_URL  — explicit opt-in (any environment)
 *   - DATABASE_URL in CI — the GitHub Actions Postgres service container
 * Otherwise returns undefined and the caller starts Testcontainers.
 */
export function externalDatabaseUrl(): string | undefined {
  if (process.env.TEST_DATABASE_URL) {
    return process.env.TEST_DATABASE_URL;
  }
  if (process.env.CI && process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }
  return undefined;
}

/**
 * Start a disposable Postgres. The data directory is backed by tmpfs so writes
 * never touch disk — a large speed win for migration + integration runs.
 */
export async function startTestDatabase(): Promise<TestDatabase> {
  const external = externalDatabaseUrl();
  if (external) {
    return { url: external, stop: async () => {} };
  }

  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer(
    POSTGRES_IMAGE,
  )
    .withDatabase('app_test')
    .withUsername('postgres')
    .withPassword('postgres')
    // Postgres image stores data under this path; tmpfs keeps it off disk.
    .withTmpFs({ '/var/lib/postgresql/data': 'rw,noexec,nosuid,size=512m' })
    .start();

  return {
    url: container.getConnectionUri(),
    stop: async () => {
      await container.stop();
    },
  };
}
