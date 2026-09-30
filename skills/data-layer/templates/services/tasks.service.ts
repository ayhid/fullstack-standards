/**
 * Frontend service for tasks: `features/tasks/services/tasks.service.ts`.
 *
 * The only layer that knows the API's paths, methods and wire format. Every
 * function is one (or a few) `apiClient.request` calls plus the mapping from
 * the wire shape to the domain types the rest of the app uses. No React, no
 * data-fetching library: hooks call these, components never do.
 */

import { apiClient } from '@lib/api/client';
import { bulkDelete, type BulkDeleteResult } from '@lib/api/bulk-delete';
import type { TaskListParams } from '@lib/api/list-params';

// ─────────────────────────────────────────────────────────────────────────────
// Domain types — prefer the shared-types wire contract when there is one
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

export type CreateTaskInput = Pick<Task, 'projectId' | 'title'>;
export type UpdateTaskInput = { id: number } & Partial<Omit<Task, 'id'>>;

// ─────────────────────────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────────────────────────

function remove(id: number): Promise<void> {
  return apiClient.request<void>({ method: 'DELETE', path: `/tasks/${id}` });
}

export const tasksService = {
  /** `params` is the normalised object the hook also puts in the query key. */
  list: (params: TaskListParams) =>
    apiClient.request<Paginated<Task>>({
      method: 'GET',
      path: '/tasks',
      query: { ...params },
    }),

  get: (id: number) =>
    apiClient.request<Task>({ method: 'GET', path: `/tasks/${id}` }),

  create: (input: CreateTaskInput) =>
    apiClient.request<Task>({ method: 'POST', path: '/tasks', body: input }),

  update: ({ id, ...patch }: UpdateTaskInput) =>
    apiClient.request<Task>({ method: 'PATCH', path: `/tasks/${id}`, body: patch }),

  remove,

  /** Settles: resolves with per-id outcomes, never rejects on a partial failure. */
  removeMany: (ids: readonly number[]): Promise<BulkDeleteResult> =>
    bulkDelete(ids, remove),
};

// ─────────────────────────────────────────────────────────────────────────────
// Strapi variant of `list` — the envelope, the query syntax and the body
// wrapper stay here, so hooks and components see the same `Paginated<Task>`.
// ─────────────────────────────────────────────────────────────────────────────
//
// interface StrapiEntity<T> { id: number; attributes: Omit<T, 'id'> }   // v4
// interface StrapiList<T> {
//   data: StrapiEntity<T>[];
//   meta: { pagination: { page: number; pageSize: number; pageCount: number; total: number } };
// }
//
// list: async ({ page = 1, pageSize = 25, search, status, sortBy, order }: TaskListParams) => {
//   const res = await apiClient.request<StrapiList<Task>>({
//     method: 'GET',
//     path: '/tasks',
//     query: {
//       pagination: { page, pageSize },
//       filters: { title: search && { $containsi: search }, status: status && { $eq: status } },
//       sort: sortBy && order ? [`${sortBy}:${order.toLowerCase()}`] : undefined,
//       populate: ['project'],
//     },
//   });
//   const { pagination } = res.meta;
//   return {
//     data: res.data.map(({ id, attributes }) => ({ id, ...attributes })),
//     meta: { page: pagination.page, pageSize: pagination.pageSize,
//             total: pagination.total, totalPages: pagination.pageCount },
//   };
// },
//
// create: async (input: CreateTaskInput) => {
//   const res = await apiClient.request<{ data: StrapiEntity<Task> }>({
//     method: 'POST', path: '/tasks', body: { data: input },
//   });
//   return { id: res.data.id, ...res.data.attributes };
// },
//
// Strapi v5 returns flat entities keyed by `documentId`; drop the
// `attributes` flattening and key paths and caches by `documentId`.
