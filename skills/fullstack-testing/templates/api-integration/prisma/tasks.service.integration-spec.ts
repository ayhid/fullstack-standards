import type { TestingModule } from '@nestjs/testing';

import type { PrismaService } from '../../src/prisma/prisma.service';
import { TasksService } from '../../src/tasks/tasks.service';
import { createProject, createTask } from './factories/entities.factory';
import { createIntegrationTestingModule, prismaOf } from './test-module';

// Example — co-locate real specs next to the service:
// src/tasks/tasks.service.integration-spec.ts
describe('TasksService (integration)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let service: TasksService;

  beforeAll(async () => {
    moduleRef = await createIntegrationTestingModule({
      providers: [TasksService],
    });
    prisma = prismaOf(moduleRef);
    service = moduleRef.get(TasksService);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('creates the task and bumps the project counter in one transaction', async () => {
    const project = await createProject(prisma, { taskCount: 0 });

    await service.create({ projectId: project.id, title: 'Write the spec' });

    // Read back through the client — do not trust the return value.
    const reloaded = await prisma.project.findUniqueOrThrow({
      where: { id: project.id },
    });
    expect(reloaded.taskCount).toBe(1);
    expect(await prisma.task.count({ where: { projectId: project.id } })).toBe(1);
  });

  it('leaves no task behind when the project does not exist', async () => {
    await expect(
      service.create({ projectId: 999_999, title: 'Orphan' }),
    ).rejects.toThrow('does not exist');

    expect(await prisma.task.count()).toBe(0);
  });

  it('paginates and reports the total', async () => {
    const project = await createProject(prisma);
    for (let i = 0; i < 3; i++) {
      await createTask(prisma, { projectId: project.id });
    }

    const page = await service.findAll({ page: 1, pageSize: 2 });

    expect(page.data).toHaveLength(2);
    expect(page.meta).toMatchObject({ total: 3, totalPages: 2 });
  });
});
