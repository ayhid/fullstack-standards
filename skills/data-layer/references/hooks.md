# Feature hooks

One file per resource: `features/<feature>/hooks/use-<resource>s.ts`, laid out as
**Types → Query hooks → Mutation hooks**. The file's exported API is the same whatever
the library, so components never change with it. Full models:
`templates/tanstack-query/use-tasks.ts`, `templates/swr/use-tasks.ts`,
`templates/rtk-query/use-tasks.ts`; the library mechanics are in
`references/adapters/<library>.md`.

A hook's fetcher is **one call to the feature's service** (`references/services.md`).
Hooks import the service, the key factory (or tags) and the library, never
`@lib/api/client` and never `fetch`; components import hooks, never the service. The
domain types live in the service file; the hook file re-exports what components need.

## Query hooks

The contract, in every library:

- **Signature:** `useTasks(params?, options?)`. `options` exposes the library's knobs
  that are safe for a caller (enabled/skip, select, placeholder data) and **omits the key
  and the fetcher**, so a caller cannot break the key.
- **One object for key and call.** Normalise defaults (`page = 1, pageSize = 25`), drop
  `undefined` values (`compact`), only pass `sortBy` when `order` is also set, then use
  that one object both in the key and as the service's argument, so the two cannot drift.
- **Result:** the library's query result. Components read only `data`, `isLoading` and
  `error`, which all three libraries provide under those names.
- **Dependent queries** are disabled through the library's mechanism (`enabled`, a
  `null` key, `skipToken`), never with a conditional hook call.
- **Paginated endpoints** return `{ data, meta: { page, pageSize, total, totalPages } }`;
  type it once and reuse it. Keep the previous page on screen while the next one loads
  (each adapter says how) to avoid the empty flash.

## Mutation hooks

The contract, in every library:

- **Signature:** `useCreateTask({ onSuccess, onError }?)`, returning
  `{ mutate(input), isPending, error }` in every library (TanStack Query's `useMutation`
  result already has that shape; the SWR and RTK Query templates adapt theirs), so
  components do not change with the library.
- **Invalidate first, then call the consumer's callback.** The consumer navigates or
  shows a toast; the cache is already correct.
- Invalidate the resource root, plus any other resource whose server-side view the
  write changes (counters, aggregates, parent detail).
- Writing the returned entity into the detail cache is an optimisation on top of
  invalidation, not a replacement for it.
- **No retry.** A mutation runs once; the transport retries only what is safe.
- Optimistic updates only where latency is visible and rollback is simple: snapshot,
  write, restore on error, invalidate when settled.
- Request-body types come from the shared-types package when there is one, not from a
  local re-declaration. Building the wire body from them is the service's job.

## What stays out of hooks

- Paths, HTTP methods, query syntax and response mapping live in the service.
- Pure transforms (form values → domain input) live in `features/<feature>/utils.ts` or
  `lib/`, and are unit-tested without React. Domain input → wire body (`FormData`,
  Strapi `{ data }`) is the service's.
- Toasts, navigation, and form state stay in the component, driven by the callbacks.

## Testing

Hooks are never tested on their own (no `renderHook` on a feature hook). The component
that uses a hook is the test subject: mock the service, render with a real, fresh cache,
and assert per branch which service function ran with which arguments.
See `fullstack-testing/references/frontend-vitest.md`.
