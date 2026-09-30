/**
 * Settling bulk delete: N parallel single-row deletes whose per-id outcome is
 * returned as data. The service passes its own `remove`, so the path stays in
 * the service and every call still goes through `apiClient.request`.
 *
 * `Promise.all` is the wrong combinator — one 404 (someone else already
 * deleted the row) would reject the whole mutation and tell the user nothing
 * was deleted while N-1 rows were gone.
 */

export interface BulkDeleteFailure {
  id: number;
  error: Error;
}

export interface BulkDeleteResult {
  requestedIds: number[];
  deletedIds: number[];
  failures: BulkDeleteFailure[];
}

/** DELETE is idempotent: a 404 means the row is already gone. */
function isAlreadyDeleted(reason: unknown): boolean {
  return (
    typeof reason === 'object' &&
    reason !== null &&
    (reason as { status?: number }).status === 404
  );
}

function toError(reason: unknown): Error {
  return reason instanceof Error ? reason : new Error(String(reason));
}

export async function bulkDelete(
  ids: readonly number[],
  deleteOne: (id: number) => Promise<unknown>
): Promise<BulkDeleteResult> {
  // A repeated id would fire a second DELETE that 404s and double-counts.
  const requestedIds = [...new Set(ids)];

  const settled = await Promise.allSettled(
    requestedIds.map(id => deleteOne(id))
  );

  const deletedIds: number[] = [];
  const failures: BulkDeleteFailure[] = [];

  settled.forEach((outcome, index) => {
    const id = requestedIds[index];
    if (outcome.status === 'fulfilled' || isAlreadyDeleted(outcome.reason)) {
      deletedIds.push(id);
      return;
    }
    failures.push({ id, error: toError(outcome.reason) });
  });

  // The mutation resolves on every outcome, so React Query's error path never
  // fires; log the server's reasons or they are lost.
  if (failures.length > 0) {
    console.error(
      'bulkDelete: %d of %d deletions failed',
      failures.length,
      requestedIds.length,
      failures.map(({ id, error }) => ({ id, message: error.message }))
    );
  }

  return { requestedIds, deletedIds, failures };
}
