/**
 * Tasks list cache invalidation after a write — tested through components.
 *
 * The bug class this pins: creating a task on a full-page form lands the user
 * back on the list without the new row; only a reload shows it. The list query
 * is INACTIVE while the form page is mounted and remounts after navigation, so
 * with a long freshness window (TanStack `staleTime`, SWR `dedupingInterval`,
 * RTK Query `refetchOnMountOrArgChange`) it serves stale cache unless the
 * create invalidated the key. Reproduced on the production defaults for that
 * reason.
 *
 * The hooks are real and never rendered on their own: the components that use
 * them are. Only the features' services are mocked, so each assertion reads
 * "the list asked the service again" plus what the user sees — whichever
 * data-fetching library the hooks use (the test utils hide it).
 */

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TaskForm } from '@features/tasks/components/TaskForm';
import { TasksListPage } from '@features/tasks/components/TasksListPage';
import { ProjectHeader } from '@features/projects/components/ProjectHeader';
import { queryKeys } from '@lib/api/query-keys';
import {
  createProductionLikeDataLayer,
  renderWithDataLayer,
} from '@/test/data-layer-test-utils';

const { tasksService, projectsService } = vi.hoisted(() => ({
  tasksService: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    removeMany: vi.fn(),
  },
  projectsService: { get: vi.fn() },
}));

// The services are the boundary: the data-fetching library, the hooks and the
// components are real.
vi.mock('@features/tasks/services/tasks.service', () => ({ tasksService }));
vi.mock('@features/projects/services/projects.service', () => ({ projectsService }));

const EXISTING = { id: 1, projectId: 7, title: 'Existing', status: 'todo' };
const CREATED = { id: 2, projectId: 7, title: 'Created', status: 'todo' };
const DEFAULT_LIST_PARAMS = { page: 1, pageSize: 25 };
const PROJECT = { id: 7, name: 'Launch', taskCount: 1 };

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

  // Asserts the key the hook actually caches. Comparing `lists()` with `all`
  // proves nothing: the factory builds one from the other.
  it('caches the list under the root that mutations invalidate', async () => {
    const dataLayer = createProductionLikeDataLayer();
    tasksService.list.mockResolvedValue(page([EXISTING]));

    renderWithDataLayer(<TasksListPage />, dataLayer);
    await screen.findByText(EXISTING.title);

    expect(tasksService.list).toHaveBeenCalledWith(DEFAULT_LIST_PARAMS);
    // RTK Query: the root is the tag type, `cachedUnder('Task')`.
    expect(dataLayer.cachedUnder(queryKeys.tasks.all)).toBe(1);
  });

  it('shows the created task when the list remounts after the form page', async () => {
    const user = userEvent.setup();
    const dataLayer = createProductionLikeDataLayer();
    tasksService.list.mockResolvedValue(page([EXISTING]));
    tasksService.create.mockResolvedValue(CREATED);
    projectsService.get.mockResolvedValue(PROJECT);

    // 1. On the list page.
    const list = renderWithDataLayer(<TasksListPage />, dataLayer);
    await screen.findByText(EXISTING.title);
    expect(tasksService.list).toHaveBeenCalledTimes(1);

    // 2. Navigate to the form page — the list unmounts. The page header shows
    //    the project's task counter.
    list.unmount();
    const form = renderWithDataLayer(
      <>
        <ProjectHeader projectId={7} />
        <TaskForm projectId={7} />
      </>,
      dataLayer
    );
    await screen.findByText(PROJECT.name);
    expect(projectsService.get).toHaveBeenCalledTimes(1);

    // 3. The form creates the task.
    tasksService.list.mockResolvedValue(page([CREATED, EXISTING]));
    projectsService.get.mockResolvedValue({ ...PROJECT, taskCount: 2 });
    await user.type(screen.getByRole('textbox', { name: 'Title' }), 'Created');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(tasksService.create).toHaveBeenCalledWith({
        projectId: 7,
        title: 'Created',
      })
    );
    // A create form never loads a task.
    expect(tasksService.get).not.toHaveBeenCalled();
    // The project's task counter changed too: the header asked again.
    await waitFor(() => expect(projectsService.get).toHaveBeenCalledTimes(2));
    form.unmount();

    // 4. Navigate back — the list remounts, asks the service again, and shows
    //    the new row. Without the invalidation, the cache would be served.
    renderWithDataLayer(<TasksListPage />, dataLayer);
    expect(await screen.findByText(CREATED.title)).toBeInTheDocument();
    expect(tasksService.list).toHaveBeenCalledTimes(2);
  });

  it('shows the edited task on a list that stayed mounted', async () => {
    const user = userEvent.setup();
    const dataLayer = createProductionLikeDataLayer();
    tasksService.list.mockResolvedValue(page([EXISTING]));
    tasksService.get.mockResolvedValue(EXISTING);
    tasksService.update.mockResolvedValue({ ...EXISTING, title: 'Renamed' });

    // One React root, as on a page with the list and an edit panel.
    renderWithDataLayer(
      <>
        <TasksListPage />
        <TaskForm taskId={1} projectId={7} />
      </>,
      dataLayer
    );
    const title = await screen.findByRole('textbox', { name: 'Title' });
    expect(tasksService.get).toHaveBeenCalledWith(1);

    tasksService.list.mockResolvedValue(page([{ ...EXISTING, title: 'Renamed' }]));
    await user.clear(title);
    await user.type(title, 'Renamed');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Renamed')).toBeInTheDocument();
    expect(tasksService.update).toHaveBeenCalledWith({ id: 1, title: 'Renamed' });
    expect(tasksService.list).toHaveBeenCalledTimes(2);
  });
});
