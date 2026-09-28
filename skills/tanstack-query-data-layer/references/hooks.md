# Feature hooks

One file per resource: `features/<feature>/hooks/use<Resource>s.ts`, laid out as
**Types → Query hooks → Mutation hooks**. `templates/use-tasks.ts` is the full model.

## Query hooks

```ts
export function useTasks(
  params?: UseTasksParams,
  options?: Omit<UseQueryOptions<PaginatedTasks, Error>, 'queryKey' | 'queryFn'>
) {
  const { page = 1, pageSize = 25, search, sortBy, order } = params ?? {};
  return useQuery({
    queryKey: queryKeys.tasks.lists({ page, pageSize, search, sortBy, order }),
    queryFn: () => apiGet<PaginatedTasks>('/tasks', compact({ page, pageSize, search, sortBy, order })),
    ...options,
  });
}
```

- Accept `options` typed as `Omit<UseQueryOptions, 'queryKey' | 'queryFn'>` so callers
  can pass `enabled`, `select`, `placeholderData` but cannot break the key.
- Guard dependent queries with `enabled: id != null`, never with a conditional hook call.
- Send only defined params (`compact`), and only send `sortBy` when `order` is also set.
- Paginated endpoints return `{ data, meta: { page, pageSize, total, totalPages } }`;
  type it once and reuse it.
- For paginated tables, `placeholderData: keepPreviousData` avoids the empty flash
  between pages.

## Mutation hooks

```ts
export function useCreateTask(options?: MutationCallbacks<Task>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTaskInput) => apiPost<Task>('/tasks', input),
    onSuccess: task => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(task.projectId) });
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
  local re-declaration.

## What stays out of hooks

- Pure transforms (form values → request body, file fields → `FormData`) live in
  `features/<feature>/utils.ts` or `lib/`, and are unit-tested without React.
- Toasts, navigation, and form state stay in the component, driven by the callbacks.
