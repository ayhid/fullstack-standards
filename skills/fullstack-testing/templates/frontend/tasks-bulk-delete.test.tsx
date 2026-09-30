/**
 * Bulk delete from `TasksListPage`, through the component: one failing id
 * must not turn the whole action into an error, and the list must refresh on
 * partial failure too. `useBulkDeleteTasks` is real and never rendered alone;
 * the per-id settling itself is pinned in `tasks.service.test.ts`.
 */

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TasksListPage } from '@features/tasks/components/TasksListPage';
import { queryKeys } from '@lib/api/query-keys';
import {
  createTestQueryClient,
  renderWithClient,
} from '@/test/query-test-utils';

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

const ROWS = [1, 2, 3].map(id => ({
  id,
  projectId: 7,
  title: `Task ${id}`,
  status: 'todo',
}));

function page<T>(rows: T[]) {
  return {
    data: rows,
    meta: { page: 1, pageSize: 25, total: rows.length, totalPages: 1 },
  };
}

describe('TasksListPage bulk delete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes the selected ids and reports a partial failure without failing the action', async () => {
    const user = userEvent.setup();
    const client = createTestQueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    tasksService.list.mockResolvedValue(page(ROWS));
    tasksService.removeMany.mockResolvedValue({
      requestedIds: [1, 2, 3],
      deletedIds: [1, 3],
      failures: [{ id: 2, error: new Error('HTTP 500') }],
    });
    renderWithClient(<TasksListPage />, client);
    await screen.findByText('Task 1');

    for (const row of ROWS) {
      await user.click(screen.getByRole('checkbox', { name: `Select ${row.title}` }));
    }
    tasksService.list.mockResolvedValue(page([ROWS[1]]));
    await user.click(screen.getByRole('button', { name: 'Delete selected' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Deleted 2 of 3 tasks.');
    expect(tasksService.removeMany).toHaveBeenCalledTimes(1);
    expect(tasksService.removeMany).toHaveBeenCalledWith([1, 2, 3]);
    // The list and the project counters refresh on partial failure too.
    await waitFor(() => expect(screen.queryByText('Task 1')).not.toBeInTheDocument());
    expect(tasksService.list).toHaveBeenCalledTimes(2);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.projects.all });
  });

  it('does not call the service when nothing is selected', async () => {
    tasksService.list.mockResolvedValue(page(ROWS));
    renderWithClient(<TasksListPage />);
    await screen.findByText('Task 1');

    expect(screen.getByRole('button', { name: 'Delete selected' })).toBeDisabled();
    expect(tasksService.removeMany).not.toHaveBeenCalled();
  });
});
