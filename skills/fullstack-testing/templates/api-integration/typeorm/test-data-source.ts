import { DataSource, DataSourceOptions } from 'typeorm';

import { Customer, Project, Task } from '../../src/database/entities';
import { getTestDatabaseUrl } from './test-database-url';

/**
 * The full entity set, mirrored from the app's database module. Keep them in
 * sync: `autoLoadEntities` hides drift at runtime, so the harness is where it
 * shows up.
 */
export const TEST_ENTITIES = [Customer, Project, Task] as const;

/** `synchronize` is always false — the migration chain owns the schema. */
export function testDataSourceOptions(
  url: string = getTestDatabaseUrl(),
): DataSourceOptions {
  return {
    type: 'postgres',
    url,
    entities: [...TEST_ENTITIES],
    synchronize: false,
    migrationsRun: false,
    logging: false,
  };
}

export function createTestDataSource(url?: string): DataSource {
  return new DataSource(testDataSourceOptions(url));
}
