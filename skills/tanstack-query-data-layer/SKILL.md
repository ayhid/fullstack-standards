---
name: tanstack-query-data-layer
description: Conventions for server state in a React + TanStack Query 5 SPA talking to a NestJS API on any ORM (TypeORM and Prisma covered) — the query-key factory, feature hooks, mutations and cache invalidation, the fetch-based HTTP client, and backend service shape. Use when adding or changing a query, mutation, query key, API call, or a NestJS service or ORM data access, or when debugging stale lists, cache collisions, or "only F5 shows it" bugs.
---

# TanStack Query data layer

Before applying anything here, look for a **project profile** (usually in the project's
`AGENTS.md`). It gives the real paths and commands and lists exceptions; it wins
wherever it disagrees with this skill.
No profile? Suggest creating one with the `project-profile` skill; meanwhile run its
detector read-only (`project-profile/scripts/detect-profile.mjs .`) for the facts.

## The layering

```
component  →  feature hook (useQuery / useMutation)  →  typed HTTP helper  →  API
                    │
                    └── keys from the central query-key factory
```

1. **TanStack Query owns all server state.** No Redux/Zustand/context copy of API data.
   React context is for client state only (auth session, theme, snackbar).
2. **One `QueryClient`, configured once** (see `templates/query-client.ts`). Queries
   retry with backoff; **mutations never retry** — they may have side effects.
3. **Every key comes from one hierarchical factory** (`templates/query-keys.ts`). No
   inline key arrays anywhere. → `references/query-keys.md`
4. **Feature hooks wrap every query and mutation**, one file per resource in
   `features/<feature>/hooks/`. Components never call `useQuery` with a raw `queryFn`
   and never call the HTTP client directly. → `references/hooks.md`
5. **The HTTP client is one small typed module** (`apiGet/apiPost/apiPatch/apiPut/
   apiDelete/apiDownload`) that owns base URL, timeouts, transport retries, auth
   refresh and error shape. Hooks call it; nothing else calls `fetch`. →
   `references/http-client.md`
6. **Backend services** hold business rules; controllers stay thin. The frontend rules
   do not depend on the ORM; the service rules are ORM-neutral, with the mechanics in
   `references/orm/typeorm.md` or `references/orm/prisma.md` (the profile says which;
   otherwise `prisma/schema.prisma` means Prisma). → `references/backend-services.md`

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
  under `'task'` and an invalidation under `'tasks'` never meet. The template's
  test pins this.
- **Bulk operations settle, they do not reject.** N parallel deletes use
  `Promise.allSettled` and return `{ requestedIds, deletedIds, failures }`; a `404` on
  `DELETE` counts as deleted. Invalidate on both success and error. →
  `templates/bulk-delete.ts`
- **Mutation hooks accept `{ onSuccess, onError }` options** and call them *after* their
  own invalidation, so a consumer cannot forget to refresh the cache.
- **User-facing errors come from the hook** (translated message), never a raw
  `error.message` from the transport.

## Testing this layer

Test hooks with a **real `QueryClient` and the real hook**; stub only the HTTP module.
Reproduce cache bugs with the **production defaults** (long `staleTime`), because that
is what makes them visible. Details and a template: the `fullstack-testing` skill,
`references/frontend-vitest.md`.

## Templates

| File                          | What it is                                               |
| ----------------------------- | -------------------------------------------------------- |
| `templates/query-client.ts`   | Production `QueryClient` defaults, exported for tests    |
| `templates/query-keys.ts`     | Hierarchical key factory with a params-in-key example    |
| `templates/use-tasks.ts`      | A full feature hook file: list, detail, create, update, delete, bulk delete |
| `templates/bulk-delete.ts`    | Settling bulk-delete transport                           |
| `templates/backend/typeorm/tasks.service.ts` | NestJS service on TypeORM                 |
| `templates/backend/prisma/tasks.service.ts`  | The same service on Prisma                |
