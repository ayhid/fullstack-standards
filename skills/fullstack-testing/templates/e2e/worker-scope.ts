import type { TestInfo } from '@playwright/test';

/**
 * Isolation for records created against a shared, real API.
 *
 * All workers talk to one API/DB, so isolation has to come from the record
 * names. A timestamp alone is not enough: two workers can start in the same
 * millisecond, and a retry re-creates the same name. `workerIndex` + `retry`
 * make it unique on both axes.
 *
 * @example workerScopedName('e2e-task', testInfo) // "e2e-task-1754130000000-w2-r0"
 */
export function workerScopedName(prefix: string, testInfo: TestInfo): string {
  return `${prefix}-${Date.now()}-w${testInfo.workerIndex}-r${testInfo.retry}`;
}
