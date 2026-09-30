import { useSWRConfig } from 'swr';

/**
 * SWR matches a key exactly; `queryKeys` roots need prefix matching, as in
 * TanStack Query. `mutate(matchesRoot(queryKeys.tasks.all))` revalidates every
 * mounted task key: lists, details and scoped variants.
 */
export function matchesRoot(root: readonly unknown[]) {
  const parts = root.map(part => JSON.stringify(part));
  return (key: unknown): boolean =>
    Array.isArray(key) &&
    key.length >= parts.length &&
    parts.every((part, index) => JSON.stringify(key[index]) === part);
}

/** Returns `invalidate(...roots)`, bound to the cache of the nearest `SWRConfig`. */
export function useInvalidate() {
  const { mutate } = useSWRConfig();
  return (...roots: ReadonlyArray<readonly unknown[]>) =>
    Promise.all(roots.map(root => mutate(matchesRoot(root))));
}
