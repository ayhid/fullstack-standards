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

## Hook tests

Template: `templates/frontend/`.

- **Real `QueryClient`, real hook, stubbed transport.** `vi.mock('@lib/api/http', …)`
  with `vi.hoisted` mocks. Never mock `@tanstack/react-query`.
- A fresh client per test. Turn `retry` off for both queries and mutations.
- **Reproduce cache bugs with the production defaults** (`staleTime` of minutes).
  With `staleTime: 0` every remount refetches and the "stale list after create" bug
  cannot appear.
- Model the real lifecycle: a list page **unmounts** while a form page creates, then
  **remounts** after navigation. Test both that path and the "list stayed mounted" path.
- Render queries and mutations that share state **in one `renderHook`** (one React root),
  as the app does; an observer in another root is a test artefact.
- Assert invalidation by outcome (the list shows the new row) and, where useful, by
  `vi.spyOn(client, 'invalidateQueries')` called with `queryKeys.<resource>.all`.
- Pin the key namespace (`lists(...)` contains `all`) in the same file.

## Rules about doubles

- **Do not stub a field component that carries `required`** in a test asserting a
  submit happens. Native constraint validation blocks submit before any React handler;
  the stub removes `required` and the test passes against a form that cannot submit in
  a browser. Assert `form.checkValidity()` alongside, or drive the real field.
- **A double must model the real cache**, including its flaws. If two hook calls share a
  cache entry in the app, a double that filters per call tests a cache the app does not
  have.
- Stub at the lowest boundary you own (the HTTP module), not at the hook, when the hook's
  own logic is part of what matters.

## Components

- Query by role and accessible name, not test ids or classes.
- `userEvent` over `fireEvent`.
- Assert what the user sees (text, disabled state, `aria-invalid`), not internal state.
