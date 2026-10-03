---
name: data-layer
description: Conventions for how a React SPA talks to a REST API through a server-state library — TanStack Query, SWR or RTK Query — whatever the backend (NestJS or Strapi). Covers the component → hook → frontend service → single API entry point layering, the cache-key factory (or RTK Query tags), mutations and cache invalidation, the fetch-based `apiClient.request`, and, for NestJS on any ORM (TypeORM and Prisma covered), backend service shape. Use when adding or changing a query, mutation, cache key, tag, frontend service, API call, or a NestJS service or ORM data access, or when debugging stale lists, cache collisions, or "only F5 shows it" bugs.
---

# Data layer

Before applying anything here, look for a **project profile** (usually in the project's
`AGENTS.md`). It gives the real paths and commands, names the data-fetching library, and
lists exceptions; it wins wherever it disagrees with this skill.
No profile? Suggest creating one with the `project-profile` skill; meanwhile run its
detector read-only (`project-profile/scripts/detect-profile.mjs .`) for the facts.

The rules below hold for any server-state library. The mechanics live in one adapter per
library; read the one the project uses (the profile says which, otherwise
`package.json`):

| Library        | Dependency                         | Adapter                              |
| -------------- | ---------------------------------- | ------------------------------------ |
| TanStack Query | `@tanstack/react-query`            | `references/adapters/tanstack-query.md` |
| SWR            | `swr`                              | `references/adapters/swr.md`         |
| RTK Query      | `@reduxjs/toolkit` + `createApi`   | `references/adapters/rtk-query.md`   |

Another library? Map it onto the vocabulary table below and write a new adapter next to
these; nothing else in the skill changes.

## Vocabulary

| Term                | TanStack Query                     | SWR                                        | RTK Query                              |
| ------------------- | ---------------------------------- | ------------------------------------------ | -------------------------------------- |
| the cache           | one `QueryClient`                  | one `SWRConfig` (its cache provider)       | one `createApi` slice in the store     |
| cache key           | `queryKey` from `queryKeys`        | the `useSWR` key, from `queryKeys`         | endpoint + args; tags from `tags.ts`   |
| resource root       | `queryKeys.<resource>.all`         | `queryKeys.<resource>.all`                 | the bare tag type (`'Task'`)           |
| invalidate a root   | `invalidateQueries({ queryKey })`  | `mutate(matchesRoot(root))`                | `invalidatesTags: ['Task']`            |
| freshness window    | `staleTime`                        | revalidate on mount + `dedupingInterval`   | `refetchOnMountOrArgChange`            |
| dependent query     | `enabled: false`                   | a `null` key                               | `skipToken`                            |

## The layering

```
component  →  feature hook  →  frontend service  →  apiClient.request()  →  REST API
                   │
                   └── cache keys from the central factory (RTK Query: tags)
```

Each layer calls only the next one. Skipping a layer is the bug, even when it works.

| Layer            | Lives in                                   | May import                    | Owns                                                        |
| ---------------- | ------------------------------------------ | ----------------------------- | ----------------------------------------------------------- |
| Component        | `components/`, `pages/`                    | feature hooks                 | UI, form state, toasts, navigation                          |
| Feature hook     | `features/<feature>/hooks/`                | services, the key factory, the library | cache keys, invalidation, `{ onSuccess, onError }`, user-facing error messages |
| Frontend service | `features/<feature>/services/`             | `@lib/api/client`             | paths, methods, query and body shape, wire ↔ domain mapping |
| API client       | `lib/api/client.ts`                        | `fetch`                       | base URL, serialisation, timeouts, retries, auth refresh, error shape |

1. **The server-state cache owns all server state.** No hand-maintained copy of API data
   in Redux, Zustand or context. React context is for client state only (auth session,
   theme, snackbar). (RTK Query's slice *is* the cache; a second slice mirroring it is
   the copy this rule forbids.)
2. **One cache, configured once**, with its production defaults exported so tests can
   reuse them. Queries retry with backoff; **mutations never retry** — they may have
   side effects.
3. **Every cache key comes from one hierarchical factory** (`templates/query-keys.ts`;
   RTK Query: one `tags.ts`). No inline keys anywhere. → `references/cache-keys.md`
4. **Components call feature hooks, never a service or the client.** One hook file per
   resource in `features/<feature>/hooks/`. → `references/hooks.md`
5. **Hooks call services, never the client.** A hook's fetcher is one service call; the
   hook adds keys, invalidation and callbacks around it. (RTK Query: endpoints use
   `queryFn` calling the service, never `query` + a fetching `baseQuery`.)
6. **Services are the only callers of the API client.** One file per resource in
   `features/<feature>/services/`, plain async functions with no React and no
   data-fetching library. They build the request and map the response to domain types,
   so the backend's wire format (a Strapi `data`/`attributes` envelope, `filters[...]`,
   `pagination[...]`, `populate`) never leaks past them. → `references/services.md`
7. **One entry point to the backend: `apiClient.request({ method, path, query, body })`.**
   It owns every transport concern; nothing else calls `fetch`. →
   `references/http-client.md`. In a **Strapi plugin's admin panel** the entry point is
   Strapi's own `getFetchClient()` (it already owns the base URL, the admin token and
   the error shape): services call it directly, with no wrapper file, and nothing else
   calls it or `useFetchClient`. The checker's `strapi-admin` preset enforces this.
8. **Backend services** (NestJS) hold business rules; controllers stay thin. The
   frontend rules do not depend on the backend; the service rules are ORM-neutral, with
   the mechanics in `references/orm/typeorm.md` or `references/orm/prisma.md` (the
   profile says which; otherwise `prisma/schema.prisma` means Prisma). →
   `references/backend-services.md`

## Rules that prevent the bugs we actually had

- **Invalidate the resource's root in every mutation's success path**, even when the list
  is not mounted. With a long freshness window, an inactive list that remounts after a
  create serves stale cache unless the create invalidated it ("the new row only shows
  after F5"). Each adapter says what "invalidate an unmounted entry" means in its library
  — they differ (SWR only refetches mounted keys).
- **A mutation that touches another resource invalidates that resource's root too**
  (creating a task changes the project's counters → invalidate the projects root).
- **Every request parameter that changes the response goes into the key.** Two hooks
  differing only in a filter that is left out of the key share one cache entry and
  serve each other's data. Keep a filter-less form of the key as the shared prefix
  for invalidation.
- **Keep one namespace per resource**, singular or plural, never both. A list keyed
  under `'task'` and an invalidation under `'tasks'` never meet. The component test
  `fullstack-testing/templates/frontend/tasks-list-invalidation.test.tsx` and the guard
  `cache-keys-contract.test.ts` pin this.
- **Bulk operations settle, they do not reject.** N parallel deletes use
  `Promise.allSettled` and return `{ requestedIds, deletedIds, failures }`; a `404` on
  `DELETE` counts as deleted. Invalidate on both success and error. →
  `templates/bulk-delete.ts`
- **Mutation hooks accept `{ onSuccess, onError }` options** and call them *after* their
  own invalidation, so a consumer cannot forget to refresh the cache.
- **User-facing errors come from the hook** (translated message), never a raw
  `error.message` from the transport.

## Testing this layer

- **Never test a hook directly.** Test it through the component that uses it: a real,
  fresh cache (the adapter's test wrapper), the feature's **service module mocked**, and
  for each branch assert which service function ran, with which arguments and how often,
  plus what the user sees. Reproduce cache bugs with the **production defaults**,
  because that is what makes them visible. Never mock the data-fetching library.
- **Test services by mocking the entry point** and asserting the exact
  `apiClient.request` config (`method`, `path`, `query`, `body`) and the mapped result.
- Only the client's own tests stub `fetch`.

Details, templates and the layering guard spec: the `fullstack-testing` skill,
`references/frontend-vitest.md`.

## Templates

Shared by every library:

| File                                  | What it is                                               |
| ------------------------------------- | -------------------------------------------------------- |
| `templates/api-client.ts`             | The single entry point: `apiClient.request`, `ApiError`  |
| `templates/services/tasks.service.ts` | A frontend service, with the Strapi variant of `list` and `create` |
| `templates/list-params.ts`            | Request parameter types shared by services, hooks and keys |
| `templates/query-keys.ts`             | Hierarchical key factory (TanStack Query, SWR)           |
| `templates/bulk-delete.ts`            | Settling bulk delete, driven by a service's `remove`     |
| `templates/backend/typeorm/tasks.service.ts` | NestJS service on TypeORM                         |
| `templates/backend/prisma/tasks.service.ts`  | The same service on Prisma                        |

Per library — each `use-tasks.ts` is the same feature hook file (list, detail, create,
update, delete, bulk delete) with the same exported API, so components do not change
with the library:

| Folder                      | Files                                                        |
| --------------------------- | ------------------------------------------------------------ |
| `templates/tanstack-query/` | `query-client.ts` (production defaults), `use-tasks.ts`      |
| `templates/swr/`            | `swr-config.ts` (production defaults), `invalidate.ts` (`matchesRoot`), `use-tasks.ts` |
| `templates/rtk-query/`      | `tags.ts`, `rtk-api.ts` (the slice, `fromService`, `makeStore`), `tasks.api.ts` (endpoints), `use-tasks.ts` |
