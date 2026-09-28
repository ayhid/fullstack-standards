/**
 * The URL global-setup provisioned. Throws if the harness was not initialised,
 * so a spec run outside the integration Jest project fails loudly instead of
 * connecting to whatever database happens to be configured.
 */
export function getTestDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      'TEST_DATABASE_URL is not set. Integration specs must run through the ' +
        'integration Jest project (its global-setup provisions the database).',
    );
  }
  return url;
}
