import { render, type RenderResult } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { Provider } from 'react-redux';

import { api, makeStore, type AppStore } from '@lib/api/rtk-api';
import type { TagType } from '@lib/api/tags';

/**
 * Test utils for RTK Query: `src/test/data-layer-test-utils.tsx`. Same
 * surface as the TanStack Query and SWR versions; a root is a tag type.
 */

export interface DataLayer {
  /** The providers a component needs around it. */
  Wrapper: (props: { children: ReactNode }) => ReactElement;
  /** How many cached queries provide a tag under `root` (`'Task'`). */
  cachedUnder: (root: TagType) => number;
  /** The library's own handle, for the rare assertion the surface lacks. */
  store: AppStore;
}

function dataLayer(store: AppStore): DataLayer {
  // Add the app's router and other client-state providers here, once.
  function Wrapper({ children }: { children: ReactNode }) {
    return <Provider store={store}>{children}</Provider>;
  }
  return {
    Wrapper,
    cachedUnder: root => api.util.selectInvalidatedBy(store.getState(), [root]).length,
    store,
  };
}

/**
 * A fresh store per test. The settings live on `createApi`, so it is already
 * production-like, and RTK Query adds no retries of its own (the endpoints
 * call services, whose client is mocked away in component tests).
 */
export function createTestDataLayer(): DataLayer {
  return dataLayer(makeStore());
}

export const createProductionLikeDataLayer = createTestDataLayer;

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
