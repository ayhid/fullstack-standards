import { Customer, Project, Task } from '../../../src/database/entities';
import { Db, managerOf, nextId } from './factory';

/**
 * Typed factories. Each accepts a partial and fills only what a NOT NULL / FK
 * constraint requires, plus one column that keeps rows identifiable. Missing
 * FK parents are created on demand: `createTask(db)` yields the whole
 * customer → project → task chain; `createTask(db, { projectId })` attaches to
 * an existing project.
 *
 * Never assert against a generated literal (`Customer 3`) — the counter is
 * per-process. Capture the entity and assert against its own field.
 */

export async function createCustomer(
  db: Db,
  overrides: Partial<Customer> = {},
): Promise<Customer> {
  const repo = managerOf(db).getRepository(Customer);
  const n = nextId();
  return repo.save(
    repo.create({
      name: `Customer ${n}`,
      // unique + NOT NULL
      reference: `CUST-TEST-${n}`,
      ...overrides,
    }),
  );
}

export async function createProject(
  db: Db,
  overrides: Partial<Project> = {},
): Promise<Project> {
  const repo = managerOf(db).getRepository(Project);
  const customerId = overrides.customerId ?? (await createCustomer(db)).id;
  return repo.save(
    repo.create({
      name: `Project ${nextId()}`,
      ...overrides,
      customerId,
    }),
  );
}

export async function createTask(
  db: Db,
  overrides: Partial<Task> = {},
): Promise<Task> {
  const repo = managerOf(db).getRepository(Task);
  const projectId = overrides.projectId ?? (await createProject(db)).id;
  return repo.save(
    repo.create({
      title: `Task ${nextId()}`,
      status: 'todo',
      ...overrides,
      projectId,
    }),
  );
}
