import { DataSource } from 'typeorm';

import { createTestDataSource } from './test-data-source';
import { REFERENCE_TABLES } from './reference-data';
import { truncateAll } from './truncate';

/** The migration ledger (wiping it corrupts the harness) and reference data. */
const PRESERVED_TABLES = new Set([
  'migrations',
  'typeorm_metadata',
  ...REFERENCE_TABLES,
]);

/**
 * Per-file setup (runs in each worker). One admin connection, used only to
 * reset state after every test. `maxWorkers: 1` makes sharing it safe.
 */
let adminDataSource: DataSource;

beforeAll(async () => {
  adminDataSource = createTestDataSource();
  await adminDataSource.initialize();
});

afterEach(async () => {
  if (adminDataSource?.isInitialized) {
    await truncateAll(
      {
        query: (sql) => adminDataSource.query(sql),
        execute: (sql) => adminDataSource.query(sql),
      },
      PRESERVED_TABLES,
    );
  }
});

afterAll(async () => {
  if (adminDataSource?.isInitialized) {
    await adminDataSource.destroy();
  }
});
