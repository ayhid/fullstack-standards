# Frontend services

A frontend service is the only code that knows how the backend is called. Hooks ask it
for domain data; it turns that into `apiClient.request` calls and turns the responses
back into domain types. `templates/services/tasks.service.ts` is the full model.

## Shape

One file per resource: `features/<feature>/services/<resource>.service.ts`, exporting
one object.

```ts
export const tasksService = {
  list: (params: TaskListParams) =>
    apiClient.request<Paginated<Task>>({ method: 'GET', path: '/tasks', query: { ...params } }),
  get: (id: number) => apiClient.request<Task>({ method: 'GET', path: `/tasks/${id}` }),
  create: (input: CreateTaskInput) =>
    apiClient.request<Task>({ method: 'POST', path: '/tasks', body: input }),
  update: ({ id, ...patch }: UpdateTaskInput) =>
    apiClient.request<Task>({ method: 'PATCH', path: `/tasks/${id}`, body: patch }),
  remove: (id: number) => apiClient.request<void>({ method: 'DELETE', path: `/tasks/${id}` }),
};
```

- **An object, not loose exports.** Component tests mock the module once
  (`vi.mock('.../tasks.service')`) and assert `tasksService.list` calls; a stable
  object keeps that mock target the same as functions are added.
- **Plain async functions.** No React, no TanStack Query, no toasts, no navigation, no
  translated messages. A service is callable from a script, a loader or a test with
  nothing mounted.
- **Imports:** `@lib/api/client`, `@lib/api/*` helpers (`bulkDelete`), shared types. Never
  a hook, a component, or another feature's hooks. Calling another service is fine when
  one operation needs two requests.

## What a service owns

| Concern                  | Rule                                                                                 |
| ------------------------ | ------------------------------------------------------------------------------------ |
| Path and method          | Only here. A path string anywhere else is a layering bug                             |
| Query                    | Receives the **normalised** params object the hook also puts in the query key, so key and request cannot drift. Undefined values are dropped by the client |
| Body                     | Built here from domain input (`FormData` for uploads, `{ data }` for Strapi)         |
| Response                 | Mapped to domain types before returning. Hooks and components never see a wire envelope |
| Errors                   | `ApiError` propagates unchanged. The hook decides the user-facing message; a service that catches and rethrows a generic `Error` loses `status` |

## Backend differences stay here

The rest of the app does not know which backend it talks to. When the backend is
Strapi, the service absorbs:

- the response envelope: v4 `{ data: { id, attributes } }` is flattened to
  `{ id, ...attributes }`; v5 is already flat but keyed by `documentId`;
- pagination: `meta.pagination.{ page, pageSize, pageCount, total }` maps to the app's
  `Paginated<T>` meta;
- the query syntax: `pagination[page]`, `filters[title][$containsi]`, `sort[0]=title:asc`,
  `populate[0]=project` — pass nested objects and arrays as `query`, the client
  serialises them in bracket notation;
- the request body: writes are wrapped in `{ data: input }`.

The commented Strapi variant at the bottom of `templates/services/tasks.service.ts` shows
all four. A NestJS service returns the domain shape already, so its mapping is usually
the identity.

## Bulk and composite operations

`removeMany(ids)` calls `bulkDelete(ids, remove)` — the settling helper runs the
service's own `remove`, so the path stays in one place and every call still goes
through the entry point. The helper returns per-id outcomes instead of rejecting on a
partial failure (see `templates/bulk-delete.ts`).

## Testing

Mock `@lib/api/client`, call the service, assert the exact `request` config and the
mapped result. Covered in `fullstack-testing/references/frontend-vitest.md`, template
`fullstack-testing/templates/frontend/tasks.service.test.ts`.
