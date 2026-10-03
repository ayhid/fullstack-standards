import { DesignSystemProvider } from '@strapi/design-system';
import { render as renderInAdmin } from '@strapi/strapi/admin/test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';

import { queryClientConfig } from '../lib/query-client';

/**
 * Test utils for a Strapi plugin's admin panel (TanStack Query):
 * `admin/src/test/data-layer-test-utils.tsx`. Same surface as
 * `tanstack-query.tsx`, so component tests read the same in any project.
 *
 * Strapi gives plugins no TanStack client, so the layer brings its own, as the
 * plugin does at runtime. The feature's service module is mocked in each test;
 * `getFetchClient` is mocked only in service tests.
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

interface Options {
  /** Reuse one layer across renders to model unmount/remount on one cache. */
  layer?: DataLayer;
  /**
   * Render inside Strapi's admin providers (`@strapi/strapi/admin/test`): for
   * components using `useNotification`, `useRBAC`, `useAPIErrorHandler`, the
   * router or other admin hooks. Without it, only the Design System theme.
   */
  admin?: boolean;
}

/**
 * Render a component — with the real hooks it uses — against `layer`.
 * Hooks are tested this way, never with `renderHook`.
 */
export function renderWithDataLayer(
  ui: ReactElement,
  { layer = createTestDataLayer(), admin = false }: Options = {}
): RenderResult & { dataLayer: DataLayer } {
  const result = admin
    ? renderInAdmin(ui, { renderOptions: { wrapper: layer.Wrapper } })
    : render(ui, {
        wrapper: ({ children }) => (
          <DesignSystemProvider>
            <layer.Wrapper>{children}</layer.Wrapper>
          </DesignSystemProvider>
        ),
      });
  return Object.assign(result, { dataLayer: layer });
}
