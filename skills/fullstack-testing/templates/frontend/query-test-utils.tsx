import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';

import { queryClientConfig } from '@lib/api/query-client';

/**
 * A fresh client per test with retries off — the default for component tests.
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

/**
 * The providers a component needs around it. Add the app's router and other
 * client-state providers here, once, rather than in each test.
 */
export function queryWrapper(client: QueryClient) {
  return function QueryWrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

/**
 * Render a component — with the real hooks it uses — against `client`.
 * Hooks are tested this way, never with `renderHook`.
 */
export function renderWithClient(
  ui: ReactElement,
  client: QueryClient = createTestQueryClient()
): RenderResult & { client: QueryClient } {
  return Object.assign(render(ui, { wrapper: queryWrapper(client) }), { client });
}
