import type { Customer, Prisma, Project, Task } from '@prisma/client';

import { Db, nextId } from './factory';

/**
 * Typed factories. Overrides use the *Unchecked* create inputs so a test can
 * pass scalar FKs (`{ projectId }`). Each fills only what a required column /
 * FK needs plus one identifying column; missing parents are created on demand:
 * `createTask(db)` yields customer → project → task.
 */

export async function createCustomer(
  db: Db,
  overrides: Partial<Prisma.CustomerUncheckedCreateInput> = {},
): Promise<Customer> {
  const n = nextId();
  return db.customer.create({
    data: {
      name: `Customer ${n}`,
      // unique + required
      reference: `CUST-TEST-${n}`,
      ...overrides,
    },
  });
}

export async function createProject(
  db: Db,
  overrides: Partial<Prisma.ProjectUncheckedCreateInput> = {},
): Promise<Project> {
  const customerId = overrides.customerId ?? (await createCustomer(db)).id;
  return db.project.create({
    data: { name: `Project ${nextId()}`, ...overrides, customerId },
  });
}

export async function createTask(
  db: Db,
  overrides: Partial<Prisma.TaskUncheckedCreateInput> = {},
): Promise<Task> {
  const projectId = overrides.projectId ?? (await createProject(db)).id;
  return db.task.create({
    data: { title: `Task ${nextId()}`, status: 'todo', ...overrides, projectId },
  });
}
