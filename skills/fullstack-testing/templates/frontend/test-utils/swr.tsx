import { render, type RenderResult } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { SWRConfig, unstable_serialize, type Cache, type SWRConfiguration } from 'swr';

import { swrConfig } from '@lib/api/swr-config';

/**
 * Test utils for SWR: `src/test/data-layer-test-utils.tsx`. Same surface as
 * the TanStack Query and RTK Query versions.
 */

export interface DataLayer {
  /** The providers a component needs around it. */
  Wrapper: (props: { children: ReactNode }) => ReactElement;
  /** How many cache entries sit under `root` (`queryKeys.<resource>.all`). */
  cachedUnder: (root: readonly unknown[]) => number;
  /** The library's own handle, for the rare assertion the surface lacks. */
  cache: Cache;
}

function dataLayer(config: SWRConfiguration): DataLayer {
  // One Map per layer, not per render: SWR keys its global state by the
  // provider's cache, so every render sharing this layer shares one cache —
  // which is what an unmount/remount test needs. A new layer is a clean cache.
  const cache: Cache = new Map();
  // Add the app's router and other client-state providers here, once.
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <SWRConfig value={{ ...config, provider: () => cache }}>{children}</SWRConfig>
    );
  }
  return {
    Wrapper,
    // `unstable_serialize(['task'])` is `@"task",` — a prefix of every key
    // under that root, and not of `['tasks', …]`.
    cachedUnder: root => {
      const prefix = unstable_serialize(root);
      return [...cache.keys()].filter(key => key.startsWith(prefix)).length;
    },
    cache,
  };
}

/** A fresh cache per test with retries and deduping off. */
export function createTestDataLayer(): DataLayer {
  return dataLayer({ dedupingInterval: 0, shouldRetryOnError: false });
}

/**
 * The production settings with retries off. Use it to reproduce cache bugs:
 * `dedupingInterval: 0` refetches on every remount and hides a missing
 * invalidation.
 */
export function createProductionLikeDataLayer(): DataLayer {
  return dataLayer({ ...swrConfig, shouldRetryOnError: false });
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
