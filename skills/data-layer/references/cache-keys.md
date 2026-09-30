# Cache keys

How keys are written differs per library (TanStack Query `queryKey`, the SWR key, RTK
Query tags — see the adapter); the rules below do not.

## Shape

Each resource gets one entry in a single `queryKeys` object (`templates/query-keys.ts`):

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

Keys are `[root, operation, ...params]`, and invalidation matches by **prefix**
(natively in TanStack Query, through `matchesRoot` in SWR), so:

| Invalidate                                   | Refreshes                                   |
| -------------------------------------------- | ------------------------------------------- |
| `queryKeys.tasks.all`                        | every task query (the default after a write) |
| `queryKeys.tasks.lists()`                    | every list, not details                      |
| `queryKeys.tasks.forProject(7)`              | every filter variant for project 7           |
| `queryKeys.tasks.detail(3)`                  | one task                                     |

RTK Query has no key arrays: the cache key is the endpoint plus its args, and
invalidation goes through tags. `templates/rtk-query/tags.ts` plays the factory's part —
one tag type per resource (the root), `{ type, id: 'LIST' }` for lists, `{ type, id }`
for one entity. → `references/adapters/rtk-query.md`

## Rules

1. **No inline keys.** An array literal (or, in RTK Query, a tag-type string) typed at
   the call site is a bug waiting for its invalidation to miss.
2. **Everything the fetcher puts on the URL goes into the key.** If the hook sends
   `category`, the key carries `category` (RTK Query: the endpoint's arg). Otherwise two
   components on one page with different filters collide on one cache entry and show
   each other's rows.
3. **Keep the filter-less overload** as the shared prefix for invalidation call sites;
   they should not need to know which filters are in use.
4. **Type the params** with the same interface the hook takes (`templates/list-params.ts`),
   so the hook and the key cannot drift.
5. **One root per resource.** Pick singular or plural once. Pin it with a test (see
   below): the plural/singular drift is invisible in review.
6. **Normalise defaults before building the key** (`page = 1, pageSize = 25`) so
   `useTasks()` and `useTasks({ page: 1 })` share a cache entry.

## Pin the namespace in a test

Assert on the key the **hook** actually caches, not on the factory. The factory builds
`lists()` from `all`, so comparing the two always passes. Render the component that
uses the hook; the hook is never tested on its own. The test utils' `cachedUnder(root)`
counts the cache entries under a root in whichever library the app uses.

```ts
it('caches the list under the root that mutations invalidate', async () => {
  const dataLayer = createProductionLikeDataLayer();
  tasksService.list.mockResolvedValue(page([EXISTING]));
  renderWithDataLayer(<TasksListPage />, dataLayer);
  await screen.findByText(EXISTING.title);

  expect(dataLayer.cachedUnder(queryKeys.tasks.all)).toBe(1);   // RTK Query: 'Task'
});
```

A hook keyed inline under `['tasks', …]` fails this. The guard test below catches the
same drift across every hook at once.

## Enforce it with a guard test, not review

`fullstack-testing/templates/frontend/cache-keys-contract.test.ts` parses the source with
the TypeScript compiler. Set its `LIBRARY` constant; it then fails on:

- an inline key outside tests, **including inside a ternary branch** (a text search misses
  `cond ? keys.a() : ['b', id]`): an array literal as `queryKey` (TanStack Query), an
  array or string literal as the key of `useSWR`/`useSWRInfinite`/`useSWRMutation`/
  `mutate` (SWR), a string tag type in `providesTags`/`invalidatesTags` outside `tags.ts`
  (RTK Query);
- a section key that leaves its section's `all` root (array keys);
- two sections sharing a root, or two tag types that differ only by a plural `s`.

Prove it before trusting it: reintroduce one inline key and one shared root and watch it
fail. With per-hook factories instead of one central object, import each factory and add a
completeness check that the list matches every exported `*Keys`.

## Keep factories where tests cannot erase them

A page test that replaces a hook module wholesale (`vi.mock('.../use-session', () => ({...}))`)
also erases any key factory exported from it, and every other module importing that factory
breaks. Put a factory that other modules import in its own file (`session-keys.ts`), or in
the central `queryKeys`.

## Merging split roots changes behaviour — on purpose

Moving `detail` under the list's root means invalidating `all` now also refetches mounted
details. That is the fix, but check it per resource: form seeds and other data a write
must not refetch belong under a separate root (e.g. an invoice pre-fill for an open form).
Update tests that pin the old literal keys by hand, and keep them literal: a literal catches
an accidental factory change that a test built from the factory would not.
