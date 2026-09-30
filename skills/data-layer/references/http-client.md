# HTTP client

A small hand-rolled `fetch` wrapper beats axios here: it is one file, fully typed, and
owns every transport concern in one place. `templates/api-client.ts` is the full model;
it lives at `lib/api/client.ts`.

## Surface: one entry point

```ts
apiClient.request<T>({
  method,                 // 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  path,                   // '/tasks/3'
  query?,                 // nested objects/arrays → bracket notation
  body?,                  // JSON, or FormData/Blob as is
  headers?, signal?,
  responseType?,          // 'json' (default) | 'blob' for downloads
})
ApiError                  // { status, data }
buildUrl(path, query?)    // for links and <img src>, never for calling fetch yourself
```

**One function, not `apiGet/apiPost/…`.** Every service test mocks exactly one function
and asserts one config shape, whatever the method or the backend. A download is
`request({ method: 'GET', path, responseType: 'blob' })`; the service that needs it
turns the blob into a saved file.

## Responsibilities

| Concern         | Rule                                                                                         |
| --------------- | -------------------------------------------------------------------------------------------- |
| Base URL        | From `VITE_API_URL`, falling back to a relative `/api` for the dev proxy; strip trailing slash |
| Query           | Drop `undefined`/`null`; nested objects and arrays serialise as `a[b][c]=v` / `a[0]=v` (Strapi `filters`, `pagination`, `sort`, `populate`); dates as ISO strings |
| Timeouts        | ~30 s per regular call, longer (~120 s) for downloads; `AbortController` per attempt           |
| Transport retry | ≤2 retries, exponential backoff with jitter, honour `Retry-After` (seconds or HTTP-date). `408`/`429` retry for any method (the server did not process it). Network `TypeError`/`AbortError` and `502, 503, 504` retry only `GET`/`HEAD`, or a request carrying an `Idempotency-Key` — a timed-out `POST` may already be committed |
| Auth            | Cookies (`credentials: 'include'`). On 401, one shared refresh promise de-duplicates concurrent refreshes; redirect to sign-in only on a **definitive** 401/403, never on a transient failure (a refresh that hit the network or a 5xx is transient) |
| Errors          | Throw an `Error` carrying `status` and the parsed body (`data`) so callers can branch on `status` |
| `204`/empty     | Resolve `undefined`, do not try to parse JSON                                                 |

## Rules

- **Only services call `apiClient.request`**, and nothing but the client calls `fetch`.
  Downloads, uploads and bulk operations are service functions built on `request` (and
  helpers in `lib/api/`, such as `bulkDelete`). Hooks and components never import the
  client.
- **Transport retries and query retries stack.** Keep the query-level `retry` low (2)
  and mutation retry at 0; the transport retries only what is safe to repeat, and a
  mutation-level retry would resend a write that may already have landed.
- **Export a real error class** (`ApiError extends Error { status; data }`); narrowing
  on `instanceof` is nicer than duck-typing `status`. Services let it through unchanged.
- **Service tests mock `apiClient.request`**; component tests mock the service, not the
  client. Only the client's own tests stub `fetch` (retry, refresh, timeout,
  serialisation).
