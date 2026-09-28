import { execFileSync } from 'child_process';
import * as path from 'path';

/**
 * Create the schema by running the REAL migration chain — the exact
 * `migration:run` script production uses (typeorm-ts-node-commonjs against
 * src/database/data-source.ts). We never `synchronize` or db-push in tests, so
 * the schema under test is byte-for-byte what migrations produce, and a broken
 * migration fails the suite here rather than silently in prod.
 */
export function runMigrations(databaseUrl: string): void {
  const apiRoot = path.resolve(__dirname, '..', '..');

  try {
    // Capture output so the (verbose) migration SQL only surfaces on failure.
    execFileSync('yarn', ['migration:run'], {
      cwd: apiRoot,
      stdio: 'pipe',
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        NODE_ENV: 'test',
      },
    });
  } catch (error) {
    const err = error as { stdout?: Buffer; stderr?: Buffer };
    process.stderr.write(err.stdout?.toString() ?? '');
    process.stderr.write(err.stderr?.toString() ?? '');
    throw new Error('Integration migration chain failed — see output above.', {
      cause: error,
    });
  }
}
