import { configureStore } from '@reduxjs/toolkit';
import { createApi, fakeBaseQuery } from '@reduxjs/toolkit/query/react';

import { tagTypes } from './tags';

/**
 * The one RTK Query slice. Endpoints are injected per feature
 * (`features/<feature>/hooks/<resource>.api.ts`).
 *
 * `fakeBaseQuery`: RTK Query never fetches here. Every endpoint's `queryFn`
 * calls the feature service, so services stay the only callers of
 * `apiClient.request`, and the client keeps every transport concern (retries
 * included — do not wrap anything in RTK Query's `retry`; mutations must not
 * retry).
 */
export const api = createApi({
  reducerPath: 'api',
  baseQuery: fakeBaseQuery<QueryError>(),
  tagTypes,
  endpoints: () => ({}),
  // Production freshness window: a remount within 5 minutes serves the cache.
  // Invalidation removes unsubscribed entries, so a write still refreshes a
  // list that is not mounted.
  refetchOnMountOrArgChange: 5 * 60,
  keepUnusedDataFor: 10 * 60,
  refetchOnFocus: false,
});

/** Errors are stored in Redux state, so they are plain objects, not `Error`s. */
export interface QueryError {
  message: string;
  status?: number;
}

function toQueryError(reason: unknown): QueryError {
  const status = (reason as { status?: unknown } | null)?.status;
  return {
    message: reason instanceof Error ? reason.message : String(reason),
    ...(typeof status === 'number' ? { status } : {}),
  };
}

/** Adapts one service call to a `queryFn`: `{ data }` or `{ error }`, never a throw. */
export function fromService<Arg, Result>(call: (arg: Arg) => Promise<Result>) {
  return async (arg: Arg): Promise<{ data: Result } | { error: QueryError }> => {
    try {
      return { data: await call(arg) };
    } catch (reason) {
      return { error: toQueryError(reason) };
    }
  };
}

/**
 * The app's store. Exported as a factory so every test gets a fresh cache
 * with the production settings above. Add the app's client-state slices here.
 */
export function makeStore() {
  return configureStore({
    reducer: { [api.reducerPath]: api.reducer },
    middleware: getDefault => getDefault().concat(api.middleware),
  });
}

export type AppStore = ReturnType<typeof makeStore>;
