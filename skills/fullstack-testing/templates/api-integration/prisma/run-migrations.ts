import { execFileSync } from 'child_process';
import * as path from 'path';

/**
 * Create the schema with the REAL migration chain — `prisma migrate deploy`,
 * exactly what production runs. Never `prisma db push` in tests: it builds the
 * schema from `schema.prisma` and skips the migrations, so a broken or missing
 * migration would pass here and fail at deploy.
 */
export function runMigrations(databaseUrl: string): void {
  const apiRoot = path.resolve(__dirname, '..', '..');

  try {
    // Output is captured so migration logs only surface on failure.
    execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
      cwd: apiRoot,
      stdio: 'pipe',
      env: {
        ...process.env,
        // Read by `schema.prisma` (<=6) or `prisma.config.ts` (7+).
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
