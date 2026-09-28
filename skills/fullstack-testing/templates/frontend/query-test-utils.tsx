import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { queryClientConfig } from '@lib/api/query-client';

/**
 * A fresh client per test with retries off — the default for hook tests.
 */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

/**
 * The production defaults (long staleTime) with retries off. Use it to
 * reproduce cache bugs: with staleTime 0 every remount refetches and hides them.
 */
export function createProductionLikeQueryClient(): QueryClient {
  return new QueryClient({
    ...queryClientConfig,
    defaultOptions: {
      ...queryClientConfig.defaultOptions,
      queries: { ...queryClientConfig.defaultOptions?.queries, retry: false },
      mutations: { ...queryClientConfig.defaultOptions?.mutations, retry: false },
    },
  });
}

export function queryWrapper(client: QueryClient) {
  return function QueryWrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}
