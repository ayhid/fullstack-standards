# Adapter: RTK Query (Redux Toolkit 2)

The rules are in `SKILL.md`, `references/hooks.md` and `references/cache-keys.md`; this
file is only how they are written with `@reduxjs/toolkit/query`.

| File in the app                        | Template                                 |
| -------------------------------------- | ---------------------------------------- |
| `lib/api/rtk-api.ts`                   | `templates/rtk-query/rtk-api.ts` (the slice, `fromService`, `makeStore`) |
| `lib/api/tags.ts`                      | `templates/rtk-query/tags.ts`            |
| `lib/api/list-params.ts`               | `templates/list-params.ts`               |
| `features/<feature>/hooks/<resource>.api.ts` | `templates/rtk-query/tasks.api.ts` (endpoints) |
| `features/<feature>/hooks/use-<resource>s.ts` | `templates/rtk-query/use-tasks.ts` |
| `src/test/data-layer-test-utils.tsx`   | `fullstack-testing/templates/frontend/test-utils/rtk-query.tsx` |

## Keeping the layering

RTK Query's default is to describe the request in the endpoint (`query: () => '/tasks'`)
and fetch through a `baseQuery`. That puts paths in the hook layer and a second HTTP
client next to `apiClient`. Instead:

- `baseQuery: fakeBaseQuery<QueryError>()` — RTK Query never fetches.
- Every endpoint uses **`queryFn: fromService(arg => tasksService.list(arg))`**. The
  service stays the only caller of `apiClient.request`; `fromService` turns a resolved
  value into `{ data }` and a throw into `{ error }`.
- Endpoint files live in `features/<feature>/hooks/` and are injected with
  `api.injectEndpoints`. They belong to the hook layer, so the architecture checks treat
  them like hooks (services allowed, the client denied).
- Components never import `tasksApi` or its generated hooks: `use-tasks.ts` wraps them,
  so the feature's hook API is the same as with the other libraries.

## The cache

The `createApi` slice is the cache — it is not a "Redux copy" of server state. A second
slice that copies query results is. Production settings live on `createApi`:
`refetchOnMountOrArgChange: 300` (seconds — the `staleTime` equivalent),
`keepUnusedDataFor: 600`, `refetchOnFocus: false`. No `retry()` wrapper: the transport
retries what is safe, and mutations must not retry.

Errors live in Redux state, so they are plain `QueryError` objects (`{ message, status }`),
not `Error` instances.

## Keys are args; roots are tags

- The cache key is the endpoint plus its arg. Pass the normalised params object as the
  arg and every filter is in the key by construction.
- `tags.ts` is the factory: one tag type per resource (singular), `tags.tasks.list`
  (`{ type: 'Task', id: 'LIST' }`), `tags.tasks.detail(id)`, and the root
  `tags.tasks.all` (`'Task'`).
- List endpoints provide `list` plus a `detail` per row; detail endpoints provide
  `detail(id)`.
- Every write declares `invalidatesTags: [tags.tasks.all, tags.projects.all]`.
  Invalidating the bare type refetches every subscribed query that provides any `Task`
  tag, and **removes unsubscribed ones**, so an unmounted list fetches fresh on remount.
- RTK Query applies `invalidatesTags` on a failed mutation too. The bulk delete relies on
  that; for other writes it is a harmless extra refetch.

## Query hooks

```ts
export function useTasks(params?: TaskListParams, { enabled = true } = {}) {
  const query = /* normalised + compacted, as in every adapter */;
  return tasksApi.useListTasksQuery(enabled ? query : skipToken);
}
```

- Dependent queries: `skipToken`.
- `data` keeps the last result while a new arg loads (keep-previous by default);
  `currentData` is the strict per-arg value.

## Mutation hooks

`use-tasks.ts` adapts `[trigger, state]` to `{ mutate, isPending, error }`:
`trigger(input).unwrap().then(onSuccess, onError)`. `unwrap()` settles after the
fulfilled action, when the tags are already invalidated, so the consumer's callback runs
on a correct cache.

Optimistic updates: `onQueryStarted` with `api.util.updateQueryData`, `patch.undo()` on
failure; the tags still invalidate.

## Tests

A fresh store per test (`makeStore()`), which already carries the production settings;
`createProductionLikeDataLayer` is the same function. `cachedUnder('Task')` is
`api.util.selectInvalidatedBy(state, ['Task']).length`. Roots in tests are tag types.

## Guard

`cache-keys-contract.test.ts` with `LIBRARY = 'rtk-query'`: no string tag type in
`providesTags`/`invalidatesTags` outside `lib/api/tags.ts` (ids like `'LIST'` are
allowed), and no two tag types that differ only by a plural `s`.
