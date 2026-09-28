import { expect, type Page } from '@playwright/test';

/**
 * Guard for route-mocked specs: every API request must be answered by a stub.
 *
 * Playwright checks the MOST RECENTLY registered route first, so call this
 * BEFORE registering any stub — it then only sees what no stub claimed. It
 * aborts those requests (so nothing reaches a real API) and records them.
 *
 * @example
 *   const unclaimed = await installApiCatchAll(page, API_URL);
 *   await mockSession(page, adminUser);
 *   await page.route(`${API_URL}/tasks*`, route => route.fulfill({ json: page1 }));
 *   // … drive the UI …
 *   expectNoUnclaimedRequests(unclaimed);
 */
export async function installApiCatchAll(
  page: Page,
  apiOrigin: string
): Promise<string[]> {
  const unclaimed: string[] = [];
  await page.route(`${apiOrigin}/**`, async route => {
    const request = route.request();
    unclaimed.push(`${request.method()} ${request.url()}`);
    await route.abort();
  });
  return unclaimed;
}

export function expectNoUnclaimedRequests(unclaimed: string[]): void {
  expect(unclaimed, 'API requests no stub answered (each was aborted)').toEqual(
    []
  );
}
