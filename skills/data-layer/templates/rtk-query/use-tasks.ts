import { skipToken } from '@reduxjs/toolkit/query/react';

import type { BulkDeleteResult } from '@lib/api/bulk-delete';
import type { QueryError } from '@lib/api/rtk-api';
import type { TaskListParams } from '@lib/api/list-params';

import type {
  CreateTaskInput,
  Paginated,
  Task,
  UpdateTaskInput,
} from '../services/tasks.service';
import { tasksApi } from './tasks.api';

// Components import these hooks and re-exported types — never the service,
// never the generated `tasksApi` hooks.
export type { CreateTaskInput, Paginated, Task, UpdateTaskInput };

interface MutationCallbacks<TResult> {
  onSuccess?: (result: TResult) => void;
  onError?: (error: QueryError) => void;
}

interface QueryOptions {
  enabled?: boolean;
}

/** Drop undefined values so they never reach the URL. */
function compact<T extends object>(params: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined)
  ) as Partial<T>;
}

/**
 * The same `{ mutate, isPending, error }` surface as the other adapters.
 * `unwrap()` settles after the fulfilled action, i.e. after RTK Query has
 * invalidated the endpoint's tags — so the consumer's callback runs on a
 * cache that is already correct.
 */
function withCallbacks<TInput, TResult>(
  [trigger, state]: readonly [
    (input: TInput) => { unwrap: () => Promise<TResult> },
    { isLoading: boolean; error?: unknown },
  ],
  options?: MutationCallbacks<TResult>
) {
  return {
    mutate: (input: TInput) => {
      trigger(input)
        .unwrap()
        .then(
          result => options?.onSuccess?.(result),
          (error: QueryError) => options?.onError?.(error)
        );
    },
    isPending: state.isLoading,
    error: state.error as QueryError | undefined,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Query hooks
// ─────────────────────────────────────────────────────────────────────────────

export function useTasks(params?: TaskListParams, { enabled = true }: QueryOptions = {}) {
  // Normalise defaults before building the arg so equivalent calls share a
  // cache entry. The arg is both the cache key and the service's argument.
  const { page = 1, pageSize = 25, search, status, sortBy, order } =
    params ?? {};
  const query = compact({
    page,
    pageSize,
    search,
    status,
    ...(sortBy && order ? { sortBy, order } : {}),
  });

  // `data` keeps the previous page while the next one loads; `currentData`
  // is the strict per-arg value.
  return tasksApi.useListTasksQuery(enabled ? query : skipToken);
}

export function useTask(id: number | undefined, { enabled = true }: QueryOptions = {}) {
  return tasksApi.useGetTaskQuery(enabled && id != null ? id : skipToken);
}

// ─────────────────────────────────────────────────────────────────────────────
// Mutation hooks — invalidation is declared on the endpoint (`invalidatesTags`)
// ─────────────────────────────────────────────────────────────────────────────

export function useCreateTask(options?: MutationCallbacks<Task>) {
  return withCallbacks(tasksApi.useCreateTaskMutation(), options);
}

export function useUpdateTask(options?: MutationCallbacks<Task>) {
  return withCallbacks(tasksApi.useUpdateTaskMutation(), options);
}

export function useDeleteTask(options?: MutationCallbacks<void>) {
  return withCallbacks(tasksApi.useDeleteTaskMutation(), options);
}

export function useBulkDeleteTasks(options?: MutationCallbacks<BulkDeleteResult>) {
  return withCallbacks(tasksApi.useBulkDeleteTasksMutation(), options);
}
