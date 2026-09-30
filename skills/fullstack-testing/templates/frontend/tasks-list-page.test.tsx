/**
 * `TasksListPage` — the list hook's branches, asserted as service calls.
 *
 * Every request parameter must reach the service *and* the query key; a
 * filter that changes the call but not the key would serve the wrong rows
 * from cache. Asserting the service arguments per branch pins both.
 */

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TasksListPage } from '@features/tasks/components/TasksListPage';
import { ApiError } from '@lib/api/client';
import {
  createProductionLikeDataLayer,
  renderWithDataLayer,
} from '@/test/data-layer-test-utils';

const { tasksService } = vi.hoisted(() => ({
  tasksService: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    removeMany: vi.fn(),
  },
}));

vi.mock('@features/tasks/services/tasks.service', () => ({ tasksService }));

const TODO = { id: 1, projectId: 7, title: 'Write spec', status: 'todo' };
const DONE = { id: 2, projectId: 7, title: 'Ship it', status: 'done' };

function page<T>(rows: T[]) {
  return {
    data: rows,
    meta: { page: 1, pageSize: 25, total: rows.length, totalPages: 1 },
  };
}

describe('TasksListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('asks for the first page with the default page size', async () => {
    tasksService.list.mockResolvedValue(page([TODO, DONE]));
    renderWithDataLayer(<TasksListPage />);

    expect(await screen.findByText('Write spec')).toBeInTheDocument();
    expect(screen.getByText('Ship it')).toBeInTheDocument();
    // Normalised params only: no `undefined` filters, no half sort.
    expect(tasksService.list).toHaveBeenCalledTimes(1);
    expect(tasksService.list).toHaveBeenCalledWith({ page: 1, pageSize: 25 });
  });

  it('asks again with the status filter when the user picks one', async () => {
    const user = userEvent.setup();
    tasksService.list.mockImplementation(async (params: { status?: string }) =>
      page(params.status === 'done' ? [DONE] : [TODO, DONE])
    );
    renderWithDataLayer(<TasksListPage />);
    await screen.findByText('Write spec');

    await user.selectOptions(screen.getByRole('combobox', { name: 'Status' }), 'done');

    await waitFor(() =>
      expect(tasksService.list).toHaveBeenLastCalledWith({
        page: 1,
        pageSize: 25,
        status: 'done',
      })
    );
    await waitFor(() =>
      expect(screen.queryByText('Write spec')).not.toBeInTheDocument()
    );
  });

  it('serves a filter it already fetched from cache, without a new call', async () => {
    const user = userEvent.setup();
    tasksService.list.mockImplementation(async (params: { status?: string }) =>
      page(params.status === 'done' ? [DONE] : [TODO, DONE])
    );
    // Production defaults: a long freshness window makes the cache observable.
    renderWithDataLayer(<TasksListPage />, createProductionLikeDataLayer());
    await screen.findByText('Write spec');

    const status = screen.getByRole('combobox', { name: 'Status' });
    await user.selectOptions(status, 'done');
    await waitFor(() =>
      expect(screen.queryByText('Write spec')).not.toBeInTheDocument()
    );
    await user.selectOptions(status, '');

    // Back to "All": the first key is still fresh, so no third call.
    expect(await screen.findByText('Write spec')).toBeInTheDocument();
    expect(tasksService.list).toHaveBeenCalledTimes(2);
  });

  it('shows an error the user can read when the list fails to load', async () => {
    tasksService.list.mockRejectedValue(new ApiError(500, null));
    renderWithDataLayer(<TasksListPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not load tasks.'
    );
  });
});
