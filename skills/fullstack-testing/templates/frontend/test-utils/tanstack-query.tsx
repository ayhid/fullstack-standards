import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';

import { queryClientConfig } from '@lib/api/query-client';

/**
 * Test utils for TanStack Query: `src/test/data-layer-test-utils.tsx`.
 * The SWR and RTK Query versions export the same surface, so component tests
 * do not change with the library.
 */

export interface DataLayer {
  /** The providers a component needs around it. */
  Wrapper: (props: { children: ReactNode }) => ReactElement;
  /** How many cache entries sit under `root` (`queryKeys.<resource>.all`). */
  cachedUnder: (root: readonly unknown[]) => number;
  /** The library's own handle, for the rare assertion the surface lacks. */
  client: QueryClient;
}

function dataLayer(client: QueryClient): DataLayer {
  // Add the app's router and other client-state providers here, once,
  // rather than in each test.
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return {
    Wrapper,
    cachedUnder: root => client.getQueryCache().findAll({ queryKey: root }).length,
    client,
  };
}

/** A fresh cache per test with retries off — the default for component tests. */
export function createTestDataLayer(): DataLayer {
  return dataLayer(
    new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
  );
}

/**
 * The production defaults (long staleTime) with retries off. Use it to
 * reproduce cache bugs: with staleTime 0 every remount refetches and hides them.
 */
export function createProductionLikeDataLayer(): DataLayer {
  return dataLayer(
    new QueryClient({
      ...queryClientConfig,
      defaultOptions: {
        ...queryClientConfig.defaultOptions,
        queries: { ...queryClientConfig.defaultOptions?.queries, retry: false },
        mutations: { ...queryClientConfig.defaultOptions?.mutations, retry: false },
      },
    })
  );
}

/**
 * Render a component — with the real hooks it uses — against `layer`. Pass the
 * same layer to several renders to model unmount/remount on one cache.
 * Hooks are tested this way, never with `renderHook`.
 */
export function renderWithDataLayer(
  ui: ReactElement,
  layer: DataLayer = createTestDataLayer()
): RenderResult & { dataLayer: DataLayer } {
  return Object.assign(render(ui, { wrapper: layer.Wrapper }), { dataLayer: layer });
}
