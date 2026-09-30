# Adapter: TanStack Query 5

The rules are in `SKILL.md`, `references/hooks.md` and `references/cache-keys.md`; this
file is only how they are written with `@tanstack/react-query`.

| File in the app                        | Template                                 |
| -------------------------------------- | ---------------------------------------- |
| `lib/api/query-client.ts`              | `templates/tanstack-query/query-client.ts` |
| `lib/api/query-keys.ts`                | `templates/query-keys.ts`                |
| `features/<feature>/hooks/use-<resource>s.ts` | `templates/tanstack-query/use-tasks.ts` |
| `src/test/data-layer-test-utils.tsx`   | `fullstack-testing/templates/frontend/test-utils/tanstack-query.tsx` |

## The cache

One `QueryClient`, created from the exported `queryClientConfig` and provided once at the
root. Production defaults: `staleTime` 5 min, `gcTime` 10 min, `refetchOnWindowFocus:
false`, queries `retry: 2` with exponential backoff, **mutations `retry: 0`**.

## Query hooks

```ts
export function useTasks(
  params?: TaskListParams,
  options?: Omit<UseQueryOptions<Paginated<Task>, Error>, 'queryKey' | 'queryFn'>
) {
  const { page = 1, pageSize = 25, search, sortBy, order } = params ?? {};
  const query = compact({ page, pageSize, search, ...(sortBy && order ? { sortBy, order } : {}) });
  return useQuery({
    queryKey: queryKeys.tasks.lists(query),
    queryFn: () => tasksService.list(query),
    placeholderData: keepPreviousData,
    ...options,
  });
}
```

- `options` is `Omit<UseQueryOptions, 'queryKey' | 'queryFn'>`: callers can pass
  `enabled`, `select`, `placeholderData` but cannot break the key.
- Dependent queries: `enabled: id != null`.
- Paginated tables: `placeholderData: keepPreviousData`.

## Mutation hooks

```ts
export function useCreateTask(options?: MutationCallbacks<Task>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTaskInput) => tasksService.create(input),
    onSuccess: task => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.all }); // task counters
      options?.onSuccess?.(task);
    },
    onError: error => options?.onError?.(error),
  });
}
```

- `invalidateQueries` matches by prefix and marks **inactive** queries stale too, so an
  unmounted list refetches when it remounts.
- `setQueryData(queryKeys.tasks.detail(id), task)` is an optimisation on top of
  invalidation.
- Optimistic updates: snapshot with `getQueryData` in `onMutate`, restore in `onError`,
  invalidate in `onSettled`.
- The `useMutation` result already is `{ mutate, isPending, error, … }`.

## Tests

`createProductionLikeDataLayer()` builds a `QueryClient` from `queryClientConfig` with
retries off; `cachedUnder(root)` is `getQueryCache().findAll({ queryKey: root }).length`.

## Guard

`cache-keys-contract.test.ts` with `LIBRARY = 'tanstack-query'`: no array literal as a
`queryKey` property.
