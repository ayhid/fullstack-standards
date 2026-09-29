# Playwright (browser E2E)

## Default: mock the API

Frontend journeys stub the API with `page.route` and carry a `@mock` tag. Leave a spec
unmocked only where mocking would make its assertion vacuous (auth itself, a cross-stack
contract you are deliberately proving). A mocked spec removes the *data* dependency, not
the *stack* dependency: it still loads the real frontend.

**Guard mocked specs with a catch-all** (`templates/e2e/api-catch-all.ts`): register a
route on the API base URL (e.g. `…/api`, not the app origin, which a relative `/api`
shares with the SPA's own pages) that aborts and records anything no stub claimed, and assert
the record is empty at the end. Playwright checks the **most recently registered** route
first, so register the catch-all **before** the specific stubs.

A mocked spec can stub the session endpoints too and start with an empty
`storageState`, so it spends no sign-in.

## Auth

- A `setup` project signs each role in **once** and saves a `storageState` per role;
  browser projects depend on it. Fixtures build per-role API contexts from those files,
  never by signing in again.
- Reuse a cached state only if it is unexpired, was minted against the same API origin
  and account (keep that in a sidecar `.meta.json`, never a credential), and a cheap
  "who am I" call still answers 200.
- Switch role mid-test by swapping the context's session cookie for the role's seeded
  one. Only specs whose subject is the login form drive the form.
- Never sign out a seeded session; every worker shares it.
- Credentials come from env vars, read at run time (so `--list` works without them), and
  a missing one throws naming the variable. No hardcoded fallbacks.
- Mind auth rate limits: count the sign-ins per run, and remember that a global per-IP
  limit on session checks can 429 a busy multi-worker run and read as "signed out".

## Data against a real API

- Every record a spec creates gets a **worker-unique name**
  (`templates/e2e/worker-scope.ts` → `prefix-<ms>-w<worker>-r<retry>`), because workers
  share one database and `fullyParallel` is on.
- Register cleanup for everything created; hard-disable cleanup against production.
- Seed scripts must be idempotent and refuse outside development with a **non-zero** exit.

## Rules

- **Web-first waits only**: `expect(locator).toBeVisible()`, `page.waitForResponse`.
  Never `page.waitForTimeout`.
- **No latency assertions.**
- `retries: 0` locally (a green-on-retry run hides flakiness); retries only under CI.
  Trace, video and screenshot retained on failure.
- Headless by default; a flag to watch.
- **Trim by tag, not by deleting specs.** e.g. local runs `@critical`, production runs
  `@smoke` and inverts `@mock`. An invalid or empty grep fails loudly. Remember a CLI
  `--grep` is ANDed with the project's grep, and naming a file does not lift it.
- URLs and hosts live in one `env.ts`; never re-hardcode them in specs.
- A Vite dev server compiles routes on demand: the first navigation to a route on a cold
  server can be slow. Warm or re-run once before calling a first-run timeout a
  regression; do not paper over it with a longer timeout.

## HAR replay

Useful for a few specs that need realistic, large or awkward responses; not a way to run
the suite offline.

- Playwright's recorder can drop the body of very large responses. Write the HAR
  yourself from `route.fetch()` when that happens.
- Strip `authorization`, `cookie` and `set-cookie`, and do not store large request
  bodies. Without a body, entries match on URL + method only — one upload per file.
- Replay with `notFound: 'abort'` so a missing recording fails instead of hitting the
  network.

## Local environment traps

- `CI=false` in `.env` is truthy. Remove it.
- `PLAYWRIGHT_BROWSERS_PATH=0` redirects browser lookup into `node_modules`.
- Self-signed local HTTPS needs `NODE_EXTRA_CA_CERTS` in every script that talks to it.
