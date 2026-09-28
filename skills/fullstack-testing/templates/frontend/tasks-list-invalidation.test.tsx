/**
 * Tasks list cache invalidation after a write.
 *
 * The bug class this pins: creating a task on a full-page form lands the user
 * back on the list without the new row; only a reload shows it. The list query
 * is INACTIVE while the form page is mounted and remounts after navigation, so
 * with a long staleTime it serves stale cache unless the create invalidated
 * the key. Reproduced on the production defaults for that reason.
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  useCreateTask,
  useTasks,
  useUpdateTask,
} from '@features/tasks/hooks/useTasks';
import { queryKeys } from '@lib/api/queryKeys';
import {
  createProductionLikeQueryClient,
  queryWrapper,
} from '@/test/query-test-utils';

const { apiGetMock, apiPostMock, apiPatchMock } = vi.hoisted(() => ({
  apiGetMock: vi.fn(),
  apiPostMock: vi.fn(),
  apiPatchMock: vi.fn(),
}));

// Only the transport is stubbed — react-query and the hooks are real.
vi.mock('@lib/api/http', () => ({
  apiGet: apiGetMock,
  apiPost: apiPostMock,
  apiPatch: apiPatchMock,
  apiDelete: vi.fn(),
}));

const EXISTING = { id: 1, projectId: 7, title: 'Existing', status: 'todo' };
const CREATED = { id: 2, projectId: 7, title: 'Created', status: 'todo' };

function page<T>(rows: T[]) {
  return {
    data: rows,
    meta: { page: 1, pageSize: 25, total: rows.length, totalPages: 1 },
  };
}

describe('tasks list invalidation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses one key namespace for the list and the invalidation', () => {
    expect(queryKeys.tasks.lists({ page: 1, pageSize: 25 })).toEqual(
      expect.arrayContaining([...queryKeys.tasks.all])
    );
  });

  it('shows the created task when the list remounts after the form page', async () => {
    const client = createProductionLikeQueryClient();
    apiGetMock.mockResolvedValue(page([EXISTING]));
    apiPostMock.mockResolvedValue(CREATED);

    // 1. On the list page.
    const list = renderHook(() => useTasks({ page: 1, pageSize: 25 }), {
      wrapper: queryWrapper(client),
    });
    await waitFor(() => expect(list.result.current.isSuccess).toBe(true));

    // 2. Navigate to the form page — the list unmounts.
    list.unmount();

    // 3. The form creates the task.
    const create = renderHook(() => useCreateTask(), {
      wrapper: queryWrapper(client),
    });
    apiGetMock.mockResolvedValue(page([CREATED, EXISTING]));
    await act(async () => {
      await create.result.current.mutateAsync({ projectId: 7, title: 'Created' });
    });
    create.unmount();

    // 4. Navigate back — the list remounts and must show the new row.
    const again = renderHook(() => useTasks({ page: 1, pageSize: 25 }), {
      wrapper: queryWrapper(client),
    });
    await waitFor(() =>
      expect(again.result.current.data?.data[0]?.id).toBe(CREATED.id)
    );
  });

  it('shows the edited task on a list that stayed mounted', async () => {
    const client = createProductionLikeQueryClient();
    apiGetMock.mockResolvedValue(page([EXISTING]));
    apiPatchMock.mockResolvedValue({ ...EXISTING, title: 'Renamed' });

    // One React root, as in the app.
    const view = renderHook(
      () => ({
        list: useTasks({ page: 1, pageSize: 25 }),
        update: useUpdateTask(),
      }),
      { wrapper: queryWrapper(client) }
    );
    await waitFor(() => expect(view.result.current.list.isSuccess).toBe(true));

    apiGetMock.mockResolvedValue(page([{ ...EXISTING, title: 'Renamed' }]));
    await act(async () => {
      await view.result.current.update.mutateAsync({ id: 1, title: 'Renamed' });
    });

    await waitFor(() =>
      expect(view.result.current.list.data?.data[0]?.title).toBe('Renamed')
    );
  });
});
