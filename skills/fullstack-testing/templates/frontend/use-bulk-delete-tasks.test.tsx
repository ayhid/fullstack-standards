/**
 * `useBulkDeleteTasks` on partial failure: one failing id must not reject the
 * whole mutation. Real QueryClient, real hook — only the transport is stubbed.
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useBulkDeleteTasks } from '@features/tasks/hooks/useTasks';
import { queryKeys } from '@lib/api/queryKeys';
import { createTestQueryClient, queryWrapper } from '@/test/query-test-utils';

const { apiDeleteMock } = vi.hoisted(() => ({ apiDeleteMock: vi.fn() }));

vi.mock('@lib/api/http', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPatch: vi.fn(),
  apiDelete: apiDeleteMock,
}));

const httpError = (status: number) =>
  Object.assign(new Error(`HTTP ${status}`), { status });

describe('useBulkDeleteTasks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // bulkDelete logs expected failures; keep them out of the output.
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves with per-id outcomes and invalidates the list on partial failure', async () => {
    const client = createTestQueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    apiDeleteMock.mockImplementation((path: string) =>
      path === '/tasks/2' ? Promise.reject(httpError(500)) : Promise.resolve()
    );
    const onSuccess = vi.fn();
    const onError = vi.fn();

    const { result } = renderHook(
      () => useBulkDeleteTasks({ onSuccess, onError }),
      { wrapper: queryWrapper(client) }
    );

    await act(async () => {
      const outcome = await result.current.mutateAsync([1, 2, 3]);
      expect(outcome.deletedIds).toEqual([1, 3]);
      expect(outcome.failures.map(f => f.id)).toEqual([2]);
    });

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(onError).not.toHaveBeenCalled();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.tasks.all });
  });

  it('counts an already-deleted (404) row as removed', async () => {
    const client = createTestQueryClient();
    apiDeleteMock.mockImplementation((path: string) =>
      path === '/tasks/9' ? Promise.reject(httpError(404)) : Promise.resolve()
    );

    const { result } = renderHook(() => useBulkDeleteTasks(), {
      wrapper: queryWrapper(client),
    });

    await act(async () => {
      const outcome = await result.current.mutateAsync([8, 9]);
      expect(outcome.deletedIds).toEqual([8, 9]);
      expect(outcome.failures).toEqual([]);
    });
  });
});
