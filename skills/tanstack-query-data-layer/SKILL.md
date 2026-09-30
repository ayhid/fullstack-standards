---
name: tanstack-query-data-layer
description: Conventions for how a React + TanStack Query 5 SPA talks to a REST API, whatever the backend (NestJS or Strapi) — the component → hook → frontend service → single API entry point layering, the query-key factory, mutations and cache invalidation, the fetch-based `apiClient.request`, and, for NestJS on any ORM (TypeORM and Prisma covered), backend service shape. Use when adding or changing a query, mutation, query key, frontend service, API call, or a NestJS service or ORM data access, or when debugging stale lists, cache collisions, or "only F5 shows it" bugs.
---

# TanStack Query data layer

Before applying anything here, look for a **project profile** (usually in the project's
`AGENTS.md`). It gives the real paths and commands and lists exceptions; it wins
wherever it disagrees with this skill.
No profile? Suggest creating one with the `project-profile` skill; meanwhile run its
detector read-only (`project-profile/scripts/detect-profile.mjs .`) for the facts.

## The layering

```
component  →  feature hook  →  frontend service  →  apiClient.request()  →  REST API
                   │
                   └── keys from the central query-key factory
```

Each layer calls only the next one. Skipping a layer is the bug, even when it works.

| Layer            | Lives in                                   | May import                    | Owns                                                        |
| ---------------- | ------------------------------------------ | ----------------------------- | ----------------------------------------------------------- |
| Component        | `components/`, `pages/`                    | feature hooks                 | UI, form state, toasts, navigation                          |
| Feature hook     | `features/<feature>/hooks/`                | services, `queryKeys`         | keys, cache, invalidation, `{ onSuccess, onError }`, user-facing error messages |
| Frontend service | `features/<feature>/services/`             | `@lib/api/client`             | paths, methods, query and body shape, wire ↔ domain mapping |
| API client       | `lib/api/client.ts`                        | `fetch`                       | base URL, serialisation, timeouts, retries, auth refresh, error shape |

1. **TanStack Query owns all server state.** No Redux/Zustand/context copy of API data.
   React context is for client state only (auth session, theme, snackbar).
2. **One `QueryClient`, configured once** (see `templates/query-client.ts`). Queries
   retry with backoff; **mutations never retry** — they may have side effects.
3. **Every key comes from one hierarchical factory** (`templates/query-keys.ts`). No
   inline key arrays anywhere. → `references/query-keys.md`
4. **Components call feature hooks, never a service or the client.** One hook file per
   resource in `features/<feature>/hooks/`. → `references/hooks.md`
5. **Hooks call services, never the client.** A hook's `queryFn`/`mutationFn` is one
   service call; the hook adds keys, invalidation and callbacks around it.
6. **Services are the only callers of the API client.** One file per resource in
   `features/<feature>/services/`, plain async functions with no React. They build the
   request and map the response to domain types, so the backend's wire format (a
   Strapi `data`/`attributes` envelope, `filters[...]`, `pagination[...]`, `populate`)
   never leaks past them. → `references/services.md`
7. **One entry point to the backend: `apiClient.request({ method, path, query, body })`.**
   It owns every transport concern; nothing else calls `fetch`. →
   `references/http-client.md`
8. **Backend services** (NestJS) hold business rules; controllers stay thin. The
   frontend rules do not depend on the backend; the service rules are ORM-neutral, with
   the mechanics in `references/orm/typeorm.md` or `references/orm/prisma.md` (the
   profile says which; otherwise `prisma/schema.prisma` means Prisma). →
   `references/backend-services.md`

## Rules that prevent the bugs we actually had

- **Invalidate the resource's root key (`keys.<resource>.all`) in every mutation's
  `onSuccess`**, even when the list is not mounted. With a long `staleTime`, an
  inactive list that remounts after a create serves stale cache unless the create
  invalidated it ("the new row only shows after F5").
- **A mutation that touches another resource invalidates that resource's root too**
  (creating a task changes the project's counters → invalidate `projects.all`).
- **Every request parameter that changes the response goes into the key.** Two hooks
  differing only in a filter that is left out of the key share one cache entry and
  serve each other's data. Keep a filter-less form of the key as the shared prefix
  for invalidation.
- **Keep one namespace per resource**, singular or plural, never both. A list keyed
  under `'task'` and an invalidation under `'tasks'` never meet. The component test
  `fullstack-testing/templates/frontend/tasks-list-invalidation.test.tsx` and the guard
  `query-keys-contract.test.ts` pin this.
- **Bulk operations settle, they do not reject.** N parallel deletes use
  `Promise.allSettled` and return `{ requestedIds, deletedIds, failures }`; a `404` on
  `DELETE` counts as deleted. Invalidate on both success and error. →
  `templates/bulk-delete.ts`
- **Mutation hooks accept `{ onSuccess, onError }` options** and call them *after* their
  own invalidation, so a consumer cannot forget to refresh the cache.
- **User-facing errors come from the hook** (translated message), never a raw
  `error.message` from the transport.

## Testing this layer

- **Never test a hook directly.** Test it through the component that uses it: real
  `QueryClient`, the feature's **service module mocked**, and for each branch assert
  which service function ran, with which arguments and how often, plus what the user
  sees. Reproduce cache bugs with the **production defaults** (long `staleTime`),
  because that is what makes them visible.
- **Test services by mocking the entry point** and asserting the exact
  `apiClient.request` config (`method`, `path`, `query`, `body`) and the mapped result.
- Only the client's own tests stub `fetch`.

Details, templates and the layering guard spec: the `fullstack-testing` skill,
`references/frontend-vitest.md`.

## Templates

| File                          | What it is                                               |
| ----------------------------- | -------------------------------------------------------- |
| `templates/api-client.ts`     | The single entry point: `apiClient.request`, `ApiError`  |
| `templates/services/tasks.service.ts` | A frontend service, with the Strapi variant of `list` and `create` |
| `templates/query-client.ts`   | Production `QueryClient` defaults, exported for tests    |
| `templates/query-keys.ts`     | Hierarchical key factory with a params-in-key example    |
| `templates/use-tasks.ts`      | A full feature hook file: list, detail, create, update, delete, bulk delete |
| `templates/bulk-delete.ts`    | Settling bulk delete, driven by a service's `remove`     |
| `templates/backend/typeorm/tasks.service.ts` | NestJS service on TypeORM                 |
| `templates/backend/prisma/tasks.service.ts`  | The same service on Prisma                |
