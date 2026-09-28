import { DataSource, EntityManager } from 'typeorm';

/**
 * Factories accept either a live DataSource or an EntityManager (e.g. the
 * transactional manager inside `dataSource.transaction(...)`), so a test can
 * seed inside or outside a transaction with the same call.
 */
export type Db = DataSource | EntityManager;

export function managerOf(db: Db): EntityManager {
  return db instanceof DataSource ? db.manager : db;
}

/**
 * Monotonic counter for unique-but-deterministic values (emails, references).
 * Deterministic ordering matters because integration specs run serially and
 * assert on generated data.
 */
let counter = 0;
export function nextId(): number {
  return ++counter;
}
