import type { SWRConfiguration } from 'swr';

/**
 * Production defaults, passed once to the root `<SWRConfig value={swrConfig}>`.
 * Exported so component tests reproduce cache bugs under the same settings.
 *
 * SWR's freshness window is "serve the cache, revalidate on mount", with
 * `dedupingInterval` as the only time-based window. Keep revalidate-on-mount
 * on: `mutate(matchesRoot(...))` refetches mounted keys only and leaves an
 * unmounted list's entry as it was, so a list that remounts after a create is
 * refreshed by its mount, not by the invalidation. `revalidateIfStale: false`
 * or `revalidateOnMount: false` turn that off and bring back the
 * "only F5 shows it" bug.
 */
export const swrConfig: SWRConfiguration = {
  revalidateOnFocus: false,
  revalidateIfStale: true,
  dedupingInterval: 2_000,
  // Exponential backoff is built in; cap the attempts like the other adapters.
  errorRetryCount: 2,
  // `useSWR` keys come from `queryKeys`; the fetcher is always the hook's
  // service call, so there is no global fetcher.
};
