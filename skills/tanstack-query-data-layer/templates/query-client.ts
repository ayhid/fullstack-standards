import { QueryClient, type QueryClientConfig } from '@tanstack/react-query';

/**
 * Production defaults. Exported so component tests can reproduce cache bugs
 * under the same `staleTime` the app runs with — a short or zero staleTime
 * hides them.
 */
export const queryClientConfig: QueryClientConfig = {
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 2,
      retryDelay: attempt => Math.min(1000 * 2 ** attempt, 30_000),
    },
    mutations: {
      // Mutations may have side effects; the transport already retries safe failures.
      retry: 0,
    },
  },
};

export function createQueryClient(): QueryClient {
  return new QueryClient(queryClientConfig);
}
