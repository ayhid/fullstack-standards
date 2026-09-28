/**
 * Centralised, hierarchical query keys: [root, operation, ...params].
 *
 * Invalidate `queryKeys.<resource>.all` after any write; prefix matching then
 * refreshes every list, detail and scoped variant of that resource.
 */

export interface ListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  sortBy?: string;
  order?: 'ASC' | 'DESC';
}

export interface TaskListParams extends ListParams {
  status?: string;
  assigneeId?: number;
}

/** Everything `useProjectTasks` puts on the URL — mirrored into its key. */
export interface ProjectTaskFilters {
  page?: number;
  pageSize?: number;
  status?: string;
}

export const queryKeys = {
  customers: {
    all: ['customer'] as const,
    lists: (params?: ListParams) =>
      params
        ? ([...queryKeys.customers.all, 'list', params] as const)
        : ([...queryKeys.customers.all, 'list'] as const),
    detail: (id: number) =>
      [...queryKeys.customers.all, 'detail', id] as const,
  },

  projects: {
    all: ['project'] as const,
    lists: (params?: ListParams & { customerId?: number }) =>
      params
        ? ([...queryKeys.projects.all, 'list', params] as const)
        : ([...queryKeys.projects.all, 'list'] as const),
    detail: (id: number) => [...queryKeys.projects.all, 'detail', id] as const,
  },

  tasks: {
    all: ['task'] as const,
    lists: (params?: TaskListParams) =>
      params
        ? ([...queryKeys.tasks.all, 'list', params] as const)
        : ([...queryKeys.tasks.all, 'list'] as const),
    detail: (id: number) => [...queryKeys.tasks.all, 'detail', id] as const,
    // Without `filters`: the prefix every filtered variant shares, for
    // invalidation. With `filters`: the key of one fetch. Leaving a filter out
    // would make two differently-filtered calls share one cache entry.
    forProject: (projectId: number, filters?: ProjectTaskFilters) =>
      filters
        ? ([...queryKeys.tasks.all, 'project', projectId, filters] as const)
        : ([...queryKeys.tasks.all, 'project', projectId] as const),
  },
} as const;
