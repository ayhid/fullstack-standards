# Frontend tests (Vitest + React Testing Library)

## Config

- `environment: 'jsdom'`, `globals: true`, coverage provider `v8`.
- Run with `TZ=UTC`; never write assertions that depend on the local timezone.
- Path aliases must match in `tsconfig.json`, `vite.config.ts` **and** `vitest.config.ts`.
- Coverage thresholds are flat keys (`thresholds: { lines: 60 }`) or globs. Nesting them
  under `global` (a Jest habit) is silently ignored — no gate at all.

## Global setup file

- `@testing-library/jest-dom` matchers and `vitest-axe` for a11y
  (`expect(await axe(container)).toHaveNoViolations()`).
- RTL `cleanup()` after each test.
- Default mocks for the router hooks and the auth context; tests override them per
  case rather than re-mocking the whole module.
- jsdom gaps: `ResizeObserver`, `IntersectionObserver`, `matchMedia`, `scrollTo`.
- Set `restoreMocks: true` in config, or pair `vi.spyOn` with `vi.restoreAllMocks()` in
  `afterEach` — `clearAllMocks` resets calls but leaves spies installed.

## What is tested where

```
component + its hooks   →  mock the feature service     (tasks-list-invalidation, task-form, …)
frontend service        →  mock apiClient.request       (tasks.service.test.ts)
API client              →  stub fetch                   (transport behaviour only)
```

Each layer mocks the one directly below it and nothing else. Hooks have no test file of
their own; `api-layering-contract.test.ts` fails on a `renderHook` of a feature hook.

## Component tests (every component; hooks are covered through them)

The component is the unit of frontend testing: **each component gets a test that
renders it**, whatever it uses. A component that calls a hook exercises the hook, so
the hook needs no test of its own; a component without hooks is tested just the same.
A test file may live next to the component or anywhere under the source root, as long
as it imports the component and renders one of its exports.

Templates: `templates/frontend/tasks-list-invalidation.test.tsx`, `task-form.test.tsx`,
`tasks-list-page.test.tsx`, `tasks-bulk-delete.test.tsx`.

- **Mock the feature's service module**, with `vi.hoisted` so the mocks exist when
  `vi.mock` is hoisted:

  ```ts
  const { tasksService } = vi.hoisted(() => ({
    tasksService: { list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(),
                    remove: vi.fn(), removeMany: vi.fn() },
  }));
  vi.mock('@features/tasks/services/tasks.service', () => ({ tasksService }));
  ```

  Never mock the data-fetching library (`@tanstack/react-query`, `swr`, RTK Query), the
  hook module, or `@lib/api/client` here.
- **Render with `renderWithDataLayer(ui, dataLayer)`** from `src/test/data-layer-test-utils.tsx`,
  copied from `templates/frontend/test-utils/<library>.tsx`. Every library's version
  exports the same surface, so component tests do not change with the library:

  | Export                            | What it is                                             |
  | --------------------------------- | ------------------------------------------------------ |
  | `createTestDataLayer()`           | a fresh cache, retries off — the default               |
  | `createProductionLikeDataLayer()` | the production cache settings, retries off             |
  | `renderWithDataLayer(ui, layer?)` | `render` inside the layer's providers; reuse one layer across renders to model unmount/remount |
  | `layer.cachedUnder(root)`         | cache entries under a root (`queryKeys.tasks.all`; RTK Query: `'Task'`) |

  A fresh layer per test: TanStack Query a new `QueryClient`, SWR a new `Map` cache
  provider, RTK Query a new store.
- **Cover every branch of the hooks the component uses**, each as a service-call
  assertion plus what the user sees:

  | Branch                                   | Assert                                                         |
  | ---------------------------------------- | -------------------------------------------------------------- |
  | Query runs with defaults                 | `list` called once with the normalised params (no `undefined`) |
  | A parameter changes (filter, page, sort) | called again with the new params; the rows change              |
  | Query disabled (`enabled: id != null`)   | the service function is **not** called                         |
  | Cached and fresh (production defaults)   | no extra call when returning to a fetched key                  |
  | Mutation succeeds                        | called once with the input; consumer callback ran (navigation, toast) |
  | Mutation fails                           | readable message shown, callback not run, called once (no retry) |
  | Invalidation                             | the list service is called again and the new row is visible    |
  | Create vs edit, or other mode switches   | the other service function is **not** called                   |

  Use `toHaveBeenCalledTimes` along with `toHaveBeenCalledWith`: a double fetch or a
  retried write is a bug the arguments alone do not show.
- **Reproduce cache bugs with the production defaults** (`createProductionLikeDataLayer`:
  TanStack `staleTime` of minutes, SWR's `dedupingInterval`, RTK Query's
  `refetchOnMountOrArgChange`). With a zero freshness window every remount refetches and
  the "stale list after create" bug cannot appear.
- **Model the real lifecycle**: the list page **unmounts** while the form page creates,
  then **remounts** after navigation. Test that path and the "list stayed mounted" path.
- Components that share state on one screen render **in one root**, as the app does.
- Assert invalidation by outcome: the service is called again and the new row shows.
  For another resource the write changes (a project's task counter), render the
  component that shows it in the same root, as the page does, mock its service too, and
  assert that service is called again. Do not spy on the library's invalidation call:
  it pins one library's API and says nothing about what the user sees.
- Components import domain types from the hook file (which re-exports them), never
  from the service.

## Service tests

Template: `templates/frontend/tasks.service.test.ts`.

- **Mock the entry point, keep the rest of the module real** so `ApiError` stays the
  class callers narrow on:

  ```ts
  const { request } = vi.hoisted(() => ({ request: vi.fn() }));
  vi.mock('@lib/api/client', async importOriginal => ({
    ...(await importOriginal<typeof import('@lib/api/client')>()),
    apiClient: { request },
  }));
  ```

- One `it` per service function: assert the **exact** config with `toHaveBeenCalledWith`
  (`method`, `path`, `query`, `body` — and nothing extra) and the returned value.
- Assert the **mapping**: for Strapi, feed the wire envelope and expect the flattened
  domain object and the app's pagination shape; assert writes wrap the body in
  `{ data }`.
- Assert that an `ApiError` propagates **unchanged** (`rejects.toBe(error)`).
- Composite operations (bulk delete) are tested here with `request` rejecting per call:
  a partial failure resolves with per-id outcomes, a `404` counts as deleted.

## API client tests

Only for the transport: query serialisation (bracket notation), retry policy per
method and status, `Retry-After`, the single shared refresh on concurrent 401s, no
sign-out on a transient refresh failure, `204` → `undefined`. Stub `globalThis.fetch`
and use fake timers for backoff.

## Rules about doubles

- **Do not stub a field component that carries `required`** in a test asserting a
  submit happens. Native constraint validation blocks submit before any React handler;
  the stub removes `required` and the test passes against a form that cannot submit in
  a browser. Assert `form.checkValidity()` alongside, or drive the real field.
- **A double must model the real cache**, including its flaws. If two hook calls share a
  cache entry in the app, a double that filters per call tests a cache the app does not
  have.
- Stub the layer directly below the one under test: the service for a component (so
  the hook's logic is exercised), `apiClient.request` for a service, `fetch` for the
  client. Stubbing further down turns a component test into a transport test; stubbing
  the hook skips the logic the test is for.

## Components

- Query by role and accessible name, not test ids or classes.
- `userEvent` over `fireEvent`.
- Assert what the user sees (text, disabled state, `aria-invalid`), not internal state.
