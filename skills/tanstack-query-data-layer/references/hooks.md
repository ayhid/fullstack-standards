# Feature hooks

One file per resource: `features/<feature>/hooks/use-<resource>s.ts`, laid out as
**Types → Query hooks → Mutation hooks**. `templates/use-tasks.ts` is the full model.

A hook's `queryFn`/`mutationFn` is **one call to the feature's service**
(`references/services.md`). Hooks import the service and `queryKeys`, never
`@lib/api/client` and never `fetch`; components import hooks, never the service. The
domain types live in the service file; the hook file re-exports what components need.

## Query hooks

```ts
export function useTasks(
  params?: UseTasksParams,
  options?: Omit<UseQueryOptions<PaginatedTasks, Error>, 'queryKey' | 'queryFn'>
) {
  const { page = 1, pageSize = 25, search, sortBy, order } = params ?? {};
  // One object for both key and service call, so they cannot drift.
  const query = compact({ page, pageSize, search, ...(sortBy && order ? { sortBy, order } : {}) });
  return useQuery({
    queryKey: queryKeys.tasks.lists(query),
    queryFn: () => tasksService.list(query),
    ...options,
  });
}
```

- Accept `options` typed as `Omit<UseQueryOptions, 'queryKey' | 'queryFn'>` so callers
  can pass `enabled`, `select`, `placeholderData` but cannot break the key.
- Guard dependent queries with `enabled: id != null`, never with a conditional hook call.
- Pass only defined params (`compact`), and only pass `sortBy` when `order` is also set.
  The service receives the object exactly as it is in the key.
- Paginated endpoints return `{ data, meta: { page, pageSize, total, totalPages } }`;
  type it once and reuse it.
- For paginated tables, `placeholderData: keepPreviousData` avoids the empty flash
  between pages.

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

- **Invalidate first, then call the consumer's callback.** The consumer navigates or
  shows a toast; the cache is already correct.
- Invalidate the resource root, plus any other resource whose server-side view the
  write changes (counters, aggregates, parent detail).
- `setQueryData` on the detail key is an optimisation on top of invalidation, not a
  replacement for it.
- Optimistic updates only where latency is visible and rollback is simple: snapshot in
  `onMutate`, restore in `onError`, invalidate in `onSettled`.
- Request-body types come from the shared-types package when there is one, not from a
  local re-declaration. Building the wire body from them is the service's job.

## What stays out of hooks

- Paths, HTTP methods, query syntax and response mapping live in the service.
- Pure transforms (form values → domain input) live in `features/<feature>/utils.ts` or
  `lib/`, and are unit-tested without React. Domain input → wire body (`FormData`,
  Strapi `{ data }`) is the service's.
- Toasts, navigation, and form state stay in the component, driven by the callbacks.

## Testing

Hooks are never tested on their own (no `renderHook` on a feature hook). The component
that uses a hook is the test subject: mock the service, render with a real
`QueryClient`, and assert per branch which service function ran with which arguments.
See `fullstack-testing/references/frontend-vitest.md`.
