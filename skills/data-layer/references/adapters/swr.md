# Adapter: SWR 2

The rules are in `SKILL.md`, `references/hooks.md` and `references/cache-keys.md`; this
file is only how they are written with `swr`.

| File in the app                        | Template                                 |
| -------------------------------------- | ---------------------------------------- |
| `lib/api/swr-config.ts`                | `templates/swr/swr-config.ts`            |
| `lib/api/invalidate.ts`                | `templates/swr/invalidate.ts`            |
| `lib/api/query-keys.ts`                | `templates/query-keys.ts` (same factory as TanStack Query) |
| `features/<feature>/hooks/use-<resource>s.ts` | `templates/swr/use-tasks.ts`      |
| `src/test/data-layer-test-utils.tsx`   | `fullstack-testing/templates/frontend/test-utils/swr.tsx` |

## The cache

One `<SWRConfig value={swrConfig}>` at the root; its cache provider is the cache. There
is **no global fetcher**: each hook passes its service call, so the fetcher can never
bypass the service layer.

SWR has no `staleTime`. Its freshness model is "serve the cache, revalidate on mount",
with `dedupingInterval` as the only time window. Production defaults
(`templates/swr/swr-config.ts`): `revalidateOnFocus: false`, `revalidateIfStale: true`,
`dedupingInterval: 2000`, `errorRetryCount: 2` (backoff is built in).

## Keys and invalidation — the difference that matters

Keys are the same arrays as TanStack Query's, from `queryKeys`. But SWR matches a key
**exactly**, so invalidating a root needs a filter:

```ts
const { mutate } = useSWRConfig();
mutate(matchesRoot(queryKeys.tasks.all));   // every task key: lists, details, scoped
```

`templates/swr/invalidate.ts` exports `matchesRoot` and `useInvalidate()`, which returns
`invalidate(...roots)`. Hooks never write a filter by hand.

`mutate(filter)` with no data **revalidates mounted keys only**. An unmounted list's
entry keeps its data; what refreshes it is its own revalidation when it remounts (and
`mutate` clears its dedupe marker, so that revalidation is not deduped). Hence:

- **Never set `revalidateIfStale: false` or `revalidateOnMount: false` globally** to mimic
  a long `staleTime`. The "only F5 shows it" bug comes straight back.
- A resource that must be *forgotten* (not just refreshed) after a write —
  e.g. data that must not flash stale — is cleared explicitly:
  `mutate(matchesRoot(root), undefined, { revalidate: true })`.

## Query hooks

```ts
export function useTasks(params?: TaskListParams, { enabled = true, ...options } = {}) {
  const query = /* normalised + compacted, as in every adapter */;
  return useSWR(
    enabled ? queryKeys.tasks.lists(query) : null,
    () => tasksService.list(query),
    { keepPreviousData: true, ...options }
  );
}
```

- A `null` key is SWR's `enabled: false`; the hook still takes `enabled` so its API
  matches the other adapters.
- `options` omits `fetcher`; the key is not an option at all.
- Paginated tables: `keepPreviousData: true`.

## Mutation hooks

`useSWRMutation`, adapted to `{ mutate, isPending, error }` by the template's
`useServiceMutation`:

- `throwOnError: false`, so a failure goes to `onError` instead of an unhandled rejection.
- `populateCache: false`, `revalidate: false`: the mutation's key (the resource root) is
  a namespace, not a query. Invalidation is explicit in `onSuccess` — `invalidate(...)`,
  then the consumer's callback.
- SWR mutations do not retry.
- Optimistic updates: `mutate(key, updater, { optimisticData, rollbackOnError: true })`
  on the detail key, then invalidate the root.

## Tests

`createProductionLikeDataLayer()` wraps the tree in `SWRConfig` with `swrConfig`, retries
off, and a `Map` provider **per layer** (not per render: SWR keys its global state by the
cache object, so an unmount/remount test must reuse one layer). `createTestDataLayer()`
sets `dedupingInterval: 0`. `cachedUnder(root)` counts cache keys starting with
`unstable_serialize(root)` (`@"task",` — a prefix of every task key and not of
`["tasks", …]`).

## Guard

`cache-keys-contract.test.ts` with `LIBRARY = 'swr'`: no array or string literal as the
key of `useSWR`, `useSWRInfinite`, `useSWRMutation` or `mutate`.
