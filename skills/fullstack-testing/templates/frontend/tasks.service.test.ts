/**
 * `tasksService` — tested against the single entry point.
 *
 * Each case asserts the exact `apiClient.request` config the service sends
 * (method, path, query, body) and what it returns. Nothing else is mocked:
 * the mapping and `bulkDelete` run for real. `ApiError` stays the real class
 * so the error path is asserted on the type callers narrow on.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { tasksService } from '@features/tasks/services/tasks.service';
import { ApiError } from '@lib/api/client';

const { request } = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock('@lib/api/client', async importOriginal => ({
  ...(await importOriginal<typeof import('@lib/api/client')>()),
  apiClient: { request },
}));

const TASK = { id: 3, projectId: 7, title: 'Write spec', status: 'todo' };

describe('tasksService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('list: GET /tasks with the params as the query', async () => {
    const response = {
      data: [TASK],
      meta: { page: 2, pageSize: 10, total: 11, totalPages: 2 },
    };
    request.mockResolvedValue(response);

    const result = await tasksService.list({ page: 2, pageSize: 10, status: 'todo' });

    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith({
      method: 'GET',
      path: '/tasks',
      query: { page: 2, pageSize: 10, status: 'todo' },
    });
    expect(result).toEqual(response);
  });

  it('get: GET /tasks/:id', async () => {
    request.mockResolvedValue(TASK);

    await expect(tasksService.get(3)).resolves.toEqual(TASK);
    expect(request).toHaveBeenCalledWith({ method: 'GET', path: '/tasks/3' });
  });

  it('create: POST /tasks with the input as the body', async () => {
    request.mockResolvedValue(TASK);

    await tasksService.create({ projectId: 7, title: 'Write spec' });

    expect(request).toHaveBeenCalledWith({
      method: 'POST',
      path: '/tasks',
      body: { projectId: 7, title: 'Write spec' },
    });
  });

  it('update: PATCH /tasks/:id with only the patch — the id stays in the path', async () => {
    request.mockResolvedValue({ ...TASK, title: 'Renamed' });

    await tasksService.update({ id: 3, title: 'Renamed' });

    expect(request).toHaveBeenCalledWith({
      method: 'PATCH',
      path: '/tasks/3',
      body: { title: 'Renamed' },
    });
  });

  it('remove: DELETE /tasks/:id', async () => {
    request.mockResolvedValue(undefined);

    await tasksService.remove(3);

    expect(request).toHaveBeenCalledWith({ method: 'DELETE', path: '/tasks/3' });
  });

  it('lets an ApiError through unchanged, status and body included', async () => {
    const error = new ApiError(422, { message: 'title must be unique' });
    request.mockRejectedValue(error);

    await expect(tasksService.create({ projectId: 7, title: 'Dup' })).rejects.toBe(error);
  });

  describe('removeMany', () => {
    it('sends one DELETE per distinct id and settles on partial failure', async () => {
      request.mockImplementation(({ path }: { path: string }) =>
        path === '/tasks/2' ? Promise.reject(new ApiError(500, null)) : Promise.resolve()
      );
      vi.spyOn(console, 'error').mockImplementation(() => {});

      const outcome = await tasksService.removeMany([1, 2, 3, 3]);

      expect(request.mock.calls.map(([config]) => config)).toEqual([
        { method: 'DELETE', path: '/tasks/1' },
        { method: 'DELETE', path: '/tasks/2' },
        { method: 'DELETE', path: '/tasks/3' },
      ]);
      expect(outcome.deletedIds).toEqual([1, 3]);
      expect(outcome.failures.map(f => f.id)).toEqual([2]);
    });

    it('counts an already-deleted (404) row as removed', async () => {
      request.mockImplementation(({ path }: { path: string }) =>
        path === '/tasks/9' ? Promise.reject(new ApiError(404, null)) : Promise.resolve()
      );

      const outcome = await tasksService.removeMany([8, 9]);

      expect(outcome.deletedIds).toEqual([8, 9]);
      expect(outcome.failures).toEqual([]);
    });
  });
});
