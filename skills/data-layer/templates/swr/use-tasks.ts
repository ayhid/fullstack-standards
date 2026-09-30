import useSWR, { type SWRConfiguration } from 'swr';
import useSWRMutation from 'swr/mutation';

import type { BulkDeleteResult } from '@lib/api/bulk-delete';
import { useInvalidate } from '@lib/api/invalidate';
import { queryKeys, type TaskListParams } from '@lib/api/query-keys';

import {
  tasksService,
  type CreateTaskInput,
  type Paginated,
  type Task,
  type UpdateTaskInput,
} from '../services/tasks.service';

// Hooks call the service only — never `@lib/api/client`, never `fetch`.
// Components import the hooks and these re-exported types, never the service.
export type { CreateTaskInput, Paginated, Task, UpdateTaskInput };

interface MutationCallbacks<TResult> {
  onSuccess?: (result: TResult) => void;
  onError?: (error: Error) => void;
}

// The key and the fetcher belong to the hook; callers get the other knobs.
type QueryOptions<T> = Omit<SWRConfiguration<T, Error>, 'fetcher'> & {
  enabled?: boolean;
};

/** Drop undefined values so they never reach the URL. */
function compact<T extends object>(params: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined)
  ) as Partial<T>;
}

/**
 * The same `{ mutate, isPending, error }` surface as the other adapters, so
 * components do not change with the library. Mutations never retry: SWR's
 * mutation hook has no retry, and `throwOnError: false` routes failures to
 * `onError` instead of an unhandled rejection.
 */
function useServiceMutation<TInput, TResult>(
  key: readonly unknown[],
  call: (input: TInput) => Promise<TResult>,
  settle: { onSuccess: (result: TResult) => void; onError: (error: Error) => void }
) {
  const mutation = useSWRMutation<TResult, Error, readonly unknown[], TInput>(
    key,
    (_key, { arg }) => call(arg),
    {
      throwOnError: false,
      // The mutation's key is a namespace, not a query: do not cache or
      // revalidate it. Invalidation is explicit, in `settle`.
      populateCache: false,
      revalidate: false,
      onSuccess: settle.onSuccess,
      onError: settle.onError,
    }
  );
  // `TInput` is generic here, so SWR cannot pick its trigger overload; every
  // mutation in this file takes an argument.
  const trigger = mutation.trigger as (arg: TInput) => Promise<TResult | undefined>;
  return {
    mutate: (input: TInput) => void trigger(input),
    isPending: mutation.isMutating,
    error: mutation.error,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Query hooks
// ─────────────────────────────────────────────────────────────────────────────

export function useTasks(
  params?: TaskListParams,
  { enabled = true, ...options }: QueryOptions<Paginated<Task>> = {}
) {
  // Normalise defaults before building the key so equivalent calls share a
  // cache entry. The same object is the key and the service's argument.
  const { page = 1, pageSize = 25, search, status, sortBy, order } =
    params ?? {};
  const query = compact({
    page,
    pageSize,
    search,
    status,
    ...(sortBy && order ? { sortBy, order } : {}),
  });

  return useSWR(
    enabled ? queryKeys.tasks.lists(query) : null,
    () => tasksService.list(query),
    // Keep the previous page on screen while the next one loads.
    { keepPreviousData: true, ...options }
  );
}

export function useTask(id: number | undefined, options?: QueryOptions<Task>) {
  const { enabled = true, ...rest } = options ?? {};
  // A `null` key is SWR's `enabled: false`.
  return useSWR(
    enabled && id != null ? queryKeys.tasks.detail(id) : null,
    () => tasksService.get(id!),
    rest
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Mutation hooks — invalidate first, then call the consumer's callback
// ─────────────────────────────────────────────────────────────────────────────

export function useCreateTask(options?: MutationCallbacks<Task>) {
  const invalidate = useInvalidate();

  return useServiceMutation(queryKeys.tasks.all, tasksService.create, {
    onSuccess: task => {
      // Project counters changed too, on the list and the detail page.
      void invalidate(queryKeys.tasks.all, queryKeys.projects.all);
      options?.onSuccess?.(task);
    },
    onError: error => options?.onError?.(error),
  });
}

export function useUpdateTask(options?: MutationCallbacks<Task>) {
  const invalidate = useInvalidate();

  return useServiceMutation(queryKeys.tasks.all, tasksService.update, {
    onSuccess: task => {
      // A `projectId` change moves the task between two projects' counters.
      void invalidate(queryKeys.tasks.all, queryKeys.projects.all);
      options?.onSuccess?.(task);
    },
    onError: error => options?.onError?.(error),
  });
}

export function useDeleteTask(options?: MutationCallbacks<void>) {
  const invalidate = useInvalidate();

  return useServiceMutation(queryKeys.tasks.all, tasksService.remove, {
    onSuccess: () => {
      void invalidate(queryKeys.tasks.all, queryKeys.projects.all);
      options?.onSuccess?.();
    },
    onError: error => options?.onError?.(error),
  });
}

export function useBulkDeleteTasks(options?: MutationCallbacks<BulkDeleteResult>) {
  const invalidate = useInvalidate();

  return useServiceMutation(
    queryKeys.tasks.all,
    (ids: number[]) => tasksService.removeMany(ids),
    {
      // `removeMany` settles, so this runs for partial and total failure too.
      onSuccess: result => {
        void invalidate(queryKeys.tasks.all, queryKeys.projects.all);
        options?.onSuccess?.(result);
      },
      onError: error => {
        void invalidate(queryKeys.tasks.all, queryKeys.projects.all);
        options?.onError?.(error);
      },
    }
  );
}
