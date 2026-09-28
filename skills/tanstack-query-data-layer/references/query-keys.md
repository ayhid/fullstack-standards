# Query keys

## Shape

Each resource gets one entry in a single `queryKeys` object:

```ts
tasks: {
  all: ['task'] as const,                         // root: invalidate this
  lists: (params?: TaskListParams) =>             // every list variant
    params ? [...queryKeys.tasks.all, 'list', params] as const
           : [...queryKeys.tasks.all, 'list'] as const,
  detail: (id: number) => [...queryKeys.tasks.all, 'detail', id] as const,
  forProject: (projectId: number, filters?: TaskFilters) =>   // scoped sub-lists
    filters ? [...queryKeys.tasks.all, 'project', projectId, filters] as const
            : [...queryKeys.tasks.all, 'project', projectId] as const,
},
```

Keys are `[root, operation, ...params]`. TanStack Query matches invalidation by
**prefix**, so:

| Invalidate                                   | Refreshes                                   |
| -------------------------------------------- | ------------------------------------------- |
| `queryKeys.tasks.all`                        | every task query (the default after a write) |
| `queryKeys.tasks.lists()`                    | every list, not details                      |
| `queryKeys.tasks.forProject(7)`              | every filter variant for project 7           |
| `queryKeys.tasks.detail(3)`                  | one task                                     |

## Rules

1. **No inline key arrays.** `useQuery({ queryKey: ['tasks', id] })` is a bug waiting
   for its invalidation to miss.
2. **Everything the `queryFn` puts on the URL goes into the key.** If the hook sends
   `category`, the key carries `category`. Otherwise two components on one page with
   different filters collide on one cache entry and show each other's rows.
3. **Keep the filter-less overload** as the shared prefix for invalidation call sites;
   they should not need to know which filters are in use.
4. **Type the params** with the same interface the hook takes, and export it, so the
   hook and the key cannot drift.
5. **One root per resource.** Pick singular or plural once. Pin it with a test (see
   below): the plural/singular drift is invisible in review.
6. **Normalise defaults before building the key** (`page = 1, pageSize = 25`) so
   `useTasks()` and `useTasks({ page: 1 })` share a cache entry.

## Pin the namespace in a test

```ts
it('uses one namespace for lists and invalidation', () => {
  expect(queryKeys.tasks.lists({ page: 1 })).toEqual(
    expect.arrayContaining([...queryKeys.tasks.all])
  );
});
```
