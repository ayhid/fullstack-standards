/**
 * `TaskForm` — every branch of the hooks it uses, asserted as service calls.
 *
 * `useTask`, `useCreateTask` and `useUpdateTask` are never rendered on their
 * own. Each branch below is one question: which service function ran, with
 * which arguments, how often — and what did the user see?
 */

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TaskForm } from '@features/tasks/components/TaskForm';
import { ApiError } from '@lib/api/client';
import { renderWithClient } from '@/test/query-test-utils';

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

const TASK = { id: 1, projectId: 7, title: 'Existing', status: 'todo' };

describe('TaskForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('create mode (no taskId)', () => {
    it('does not load a task — the detail query is disabled', async () => {
      renderWithClient(<TaskForm projectId={7} />);

      expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('');
      expect(tasksService.get).not.toHaveBeenCalled();
    });

    it('creates with the typed title and hands the result to onDone', async () => {
      const user = userEvent.setup();
      const onDone = vi.fn();
      const created = { ...TASK, id: 2, title: 'New' };
      tasksService.create.mockResolvedValue(created);
      renderWithClient(<TaskForm projectId={7} onDone={onDone} />);

      await user.type(screen.getByRole('textbox', { name: 'Title' }), 'New');
      await user.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() => expect(onDone).toHaveBeenCalledWith(created));
      expect(tasksService.create).toHaveBeenCalledTimes(1);
      expect(tasksService.create).toHaveBeenCalledWith({ projectId: 7, title: 'New' });
      expect(tasksService.update).not.toHaveBeenCalled();
    });

    it('shows a readable message and stays on the form when the create fails', async () => {
      const user = userEvent.setup();
      const onDone = vi.fn();
      tasksService.create.mockRejectedValue(
        new ApiError(422, { message: 'title must be unique' })
      );
      renderWithClient(<TaskForm projectId={7} onDone={onDone} />);

      await user.type(screen.getByRole('textbox', { name: 'Title' }), 'Dup');
      await user.click(screen.getByRole('button', { name: 'Save' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Could not save the task.'
      );
      expect(onDone).not.toHaveBeenCalled();
      // Mutations never retry: one write, one call.
      expect(tasksService.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('edit mode (taskId given)', () => {
    it('loads the task once and pre-fills the form', async () => {
      tasksService.get.mockResolvedValue(TASK);
      renderWithClient(<TaskForm taskId={1} projectId={7} />);

      expect(
        await screen.findByRole('textbox', { name: 'Title' })
      ).toHaveValue('Existing');
      expect(tasksService.get).toHaveBeenCalledTimes(1);
      expect(tasksService.get).toHaveBeenCalledWith(1);
    });

    it('updates, not creates, with the id and the changed fields', async () => {
      const user = userEvent.setup();
      tasksService.get.mockResolvedValue(TASK);
      tasksService.update.mockResolvedValue({ ...TASK, title: 'Renamed' });
      renderWithClient(<TaskForm taskId={1} projectId={7} />);

      const title = await screen.findByRole('textbox', { name: 'Title' });
      await user.clear(title);
      await user.type(title, 'Renamed');
      await user.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() =>
        expect(tasksService.update).toHaveBeenCalledWith({ id: 1, title: 'Renamed' })
      );
      expect(tasksService.create).not.toHaveBeenCalled();
    });
  });
});
