import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/react-query';

import { bulkDelete, type BulkDeleteResult } from '@lib/api/bulk-delete';
import { apiDelete, apiGet, apiPatch, apiPost } from '@lib/api/http';
import { queryKeys, type TaskListParams } from '@lib/api/query-keys';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface Task {
  id: number;
  projectId: number;
  title: string;
  status: 'todo' | 'doing' | 'done';
}

export interface Paginated<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

// Prefer the shared-types wire contract over these local declarations.
export type CreateTaskInput = Pick<Task, 'projectId' | 'title'>;
export type UpdateTaskInput = { id: number } & Partial<Omit<Task, 'id'>>;

interface MutationCallbacks<TResult> {
  onSuccess?: (result: TResult) => void;
  onError?: (error: Error) => void;
}

type QueryOptions<T> = Omit<UseQueryOptions<T, Error>, 'queryKey' | 'queryFn'>;

/** Drop undefined values so they never reach the URL. */
function compact<T extends object>(params: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined)
  ) as Partial<T>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Query hooks
// ─────────────────────────────────────────────────────────────────────────────

export function useTasks(
  params?: TaskListParams,
  options?: QueryOptions<Paginated<Task>>
) {
  // Normalise defaults before building the key so equivalent calls share a cache entry.
  const { page = 1, pageSize = 25, search, status, sortBy, order } =
    params ?? {};
  const query = compact({
    page,
    pageSize,
    search,
    status,
    ...(sortBy && order ? { sortBy, order } : {}),
  });

  return useQuery({
    queryKey: queryKeys.tasks.lists(query),
    queryFn: () => apiGet<Paginated<Task>>('/tasks', query),
    placeholderData: keepPreviousData,
    ...options,
  });
}

export function useTask(id: number | undefined, options?: QueryOptions<Task>) {
  return useQuery({
    queryKey: queryKeys.tasks.detail(id ?? -1),
    queryFn: () => apiGet<Task>(`/tasks/${id}`),
    enabled: id != null,
    ...options,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Mutation hooks — invalidate first, then call the consumer's callback
// ─────────────────────────────────────────────────────────────────────────────

export function useCreateTask(options?: MutationCallbacks<Task>) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateTaskInput) => apiPost<Task>('/tasks', input),
    onSuccess: task => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
      // Project counters changed too, on the list and the detail page.
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
      options?.onSuccess?.(task);
    },
    onError: error => options?.onError?.(error),
  });
}

export function useUpdateTask(options?: MutationCallbacks<Task>) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...patch }: UpdateTaskInput) =>
      apiPatch<Task>(`/tasks/${id}`, patch),
    onSuccess: task => {
      queryClient.setQueryData(queryKeys.tasks.detail(task.id), task);
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
      // A `projectId` change moves the task between two projects' counters.
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
      options?.onSuccess?.(task);
    },
    onError: error => options?.onError?.(error),
  });
}

export function useDeleteTask(options?: MutationCallbacks<void>) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      await apiDelete(`/tasks/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
      options?.onSuccess?.();
    },
    onError: error => options?.onError?.(error),
  });
}

export function useBulkDeleteTasks(options?: MutationCallbacks<BulkDeleteResult>) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (ids: number[]) => bulkDelete(ids, id => `/tasks/${id}`),
    // `bulkDelete` settles, so this runs for partial and total failure too.
    onSuccess: result => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
      options?.onSuccess?.(result);
    },
    onError: error => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
      options?.onError?.(error);
    },
  });
}
