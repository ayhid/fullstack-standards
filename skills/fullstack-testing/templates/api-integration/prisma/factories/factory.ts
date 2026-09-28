import type { Prisma, PrismaClient } from '@prisma/client';

/**
 * Factories accept the client OR a transaction client (the `tx` inside
 * `prisma.$transaction(async tx => …)`), so a test can seed inside or outside
 * a transaction with the same call.
 */
export type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Monotonic per-process counter for unique values (emails, references).
 * Deterministic within one run only — never assert against what it produced.
 */
let counter = 0;
export function nextId(): number {
  return ++counter;
}
