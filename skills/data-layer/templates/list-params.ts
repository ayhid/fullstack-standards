/**
 * Request parameter types shared by services, hooks and the cache keys.
 *
 * The hook passes one normalised params object to both the key and the
 * service call, so both are typed from here and cannot drift.
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
