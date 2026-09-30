/**
 * Task endpoints: `features/tasks/hooks/tasks.api.ts`. Part of the hook layer
 * — it imports the service and the tags, never `@lib/api/client`. Components
 * use `use-tasks.ts`, never these generated hooks.
 */

import { api, fromService } from '@lib/api/rtk-api';
import { tags } from '@lib/api/tags';
import type { TaskListParams } from '@lib/api/list-params';
import type { BulkDeleteResult } from '@lib/api/bulk-delete';

import {
  tasksService,
  type CreateTaskInput,
  type Paginated,
  type Task,
  type UpdateTaskInput,
} from '../services/tasks.service';

// Every write refreshes the task root and the project counters it changes.
// RTK Query also applies `invalidatesTags` when the mutation fails, which is
// what the bulk delete needs and harmless for the others.
const TASK_WRITE = [tags.tasks.all, tags.projects.all];

export const tasksApi = api.injectEndpoints({
  endpoints: build => ({
    // The arg is the normalised params object: RTK Query keys the cache by
    // endpoint + arg, so every filter is in the key by construction.
    listTasks: build.query<Paginated<Task>, TaskListParams>({
      queryFn: fromService(params => tasksService.list(params)),
      providesTags: result => [
        tags.tasks.list,
        ...(result?.data.map(task => tags.tasks.detail(task.id)) ?? []),
      ],
    }),
    getTask: build.query<Task, number>({
      queryFn: fromService(id => tasksService.get(id)),
      providesTags: (_result, _error, id) => [tags.tasks.detail(id)],
    }),
    createTask: build.mutation<Task, CreateTaskInput>({
      queryFn: fromService(input => tasksService.create(input)),
      invalidatesTags: TASK_WRITE,
    }),
    updateTask: build.mutation<Task, UpdateTaskInput>({
      queryFn: fromService(input => tasksService.update(input)),
      // A `projectId` change moves the task between two projects' counters.
      invalidatesTags: TASK_WRITE,
    }),
    deleteTask: build.mutation<void, number>({
      queryFn: fromService(id => tasksService.remove(id)),
      invalidatesTags: TASK_WRITE,
    }),
    bulkDeleteTasks: build.mutation<BulkDeleteResult, number[]>({
      queryFn: fromService(ids => tasksService.removeMany(ids)),
      invalidatesTags: TASK_WRITE,
    }),
  }),
});
