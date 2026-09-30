/**
 * Centralised, hierarchical cache keys: [root, operation, ...params].
 * Used as-is by TanStack Query (`queryKey`) and SWR (the `useSWR` key).
 * RTK Query uses tags instead: `rtk-query/tags.ts`.
 *
 * Invalidate `queryKeys.<resource>.all` after any write; prefix matching then
 * refreshes every list, detail and scoped variant of that resource.
 */

import type {
  ListParams,
  ProjectTaskFilters,
  TaskListParams,
} from './list-params';

export type { ListParams, ProjectTaskFilters, TaskListParams };

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
