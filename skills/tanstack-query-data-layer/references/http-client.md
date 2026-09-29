# HTTP client

A small hand-rolled `fetch` wrapper beats axios here: it is one file, fully typed, and
owns every transport concern in one place.

## Surface

```ts
apiGet<T>(path, query?)          apiPost<T>(path, body?)
apiPatch<T>(path, body?)         apiPut<T>(path, body?)
apiDelete<T>(path)               apiDownload(path, filename)
apiBuildUrl(path, query?)
```

## Responsibilities

| Concern         | Rule                                                                                         |
| --------------- | -------------------------------------------------------------------------------------------- |
| Base URL        | From `VITE_API_URL`, falling back to a relative `/api` for the dev proxy; strip trailing slash |
| Timeouts        | ~30 s per regular call, longer (~120 s) for downloads; `AbortController` per attempt           |
| Transport retry | ≤2 retries, exponential backoff with jitter, honour `Retry-After` (seconds or HTTP-date). `408`/`429` retry for any method (the server did not process it). Network `TypeError`/`AbortError` and `502, 503, 504` retry only `GET`/`HEAD`, or a request carrying an `Idempotency-Key` — a timed-out `POST` may already be committed |
| Auth            | Cookies (`credentials: 'include'`). On 401, one shared refresh promise de-duplicates concurrent refreshes; redirect to sign-in only on a **definitive** 401/403, never on a transient failure |
| Errors          | Throw an `Error` carrying `status` and the parsed body (`data`) so callers can branch on `status` |
| `204`/empty     | Resolve `undefined`, do not try to parse JSON                                                 |

## Rules

- **Nothing else calls `fetch`.** Downloads, uploads and bulk operations go through
  helpers in the same `lib/api/` folder.
- **Transport retries and query retries stack.** Keep the query-level `retry` low (2)
  and mutation retry at 0; the transport retries only what is safe to repeat, and a
  mutation-level retry would resend a write that may already have landed.
- **Export a real error class** (`ApiError extends Error { status; data }`) if you are
  starting fresh; narrowing on `instanceof` is nicer than duck-typing `status`.
- Tests stub this module with `vi.mock`, never `fetch` itself, unless the test is *about*
  the client (retry, refresh, timeout).
