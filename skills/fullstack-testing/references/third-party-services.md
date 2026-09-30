# Third-party services (email, payment, storage, SMS, error tracking, LLMs)

**Always mock the provider. Test the code that uses it, never the tool itself.** A test
proves two things about a third-party call: it is made **with the right parameters**
(or not made at all), and the right **exception is raised** when it fails, or
deliberately not raised. Whether Brevo delivers, Stripe charges or S3 stores is the
provider's business, not your suite's.

Templates: `templates/third-party/`.

## The layering

```
InvitationsService ──▶ Mailer (port) ◀── BrevoMailer (adapter) ──▶ @getbrevo/brevo
 spec: port mocked                        spec: fake SDK client
 → called with {...}, or not called       → SDK called with {templateId, to, params}
 → throws / does not throw, per rule      → SDK error → MailDeliveryError (cause kept)
```

- **Port** (`mailer.port.ts`): an injection token (`MAILER`) and an interface named after
  what the app needs (`sendInvitation`), not after the provider's API
  (`sendTransacEmail`). One typed error (`MailDeliveryError`) is all a consumer handles.
- **Adapter** (`brevo-mailer.adapter.ts`), one per provider. It is the **only** file that
  imports the SDK or reads its API key, and it maps the app's request to the provider's
  payload and the provider's failures to the port's error, with the original on `cause`.
- **Build the SDK inside the port's factory** (`{ provide: MAILER, useFactory }`). Nest
  instantiates every provider of a module eagerly; with the SDK behind its own token, a
  test that overrides only `MAILER` would still construct the real client and fail
  without credentials.
- `third-party-imports.spec.ts` fails when anything but an adapter imports an SDK, or a
  spec mocks one.

## What each spec mocks and asserts

| Spec                                   | Mocks                                   | Asserts                                              |
| -------------------------------------- | --------------------------------------- | ---------------------------------------------------- |
| Consumer, unit (`*.spec.ts`)           | the port: `{ provide: MAILER, useValue: mailer }` | called **once** with the **exact** params (`toHaveBeenCalledTimes` + `toHaveBeenCalledWith`); **not called** on paths that must not send; the exception raised on each failure |
| Consumer, integration (touches the DB) | the port: `providerOverrides: [[MAILER, mailer]]` on the harness | the same, plus the database state after a failure (rolled back, or committed and flagged) |
| Adapter (`*.adapter.spec.ts`)          | the SDK client: a plain object of `jest.fn()`s passed to the constructor | the exact SDK payload; SDK errors become the port's error with `cause`; a malformed success is a failure; missing config throws at build time |
| —                                      | —                                       | the SDK, the provider's behaviour, retries inside the SDK, the network. **Never tested.** |

Use a **typed mock** (`jest.Mocked<Mailer>` with every method a bare `jest.fn()`), and set
per test what it resolves or rejects. A shared mock that resolves everything lets an
unexpected call pass silently.

## Exceptions: decide per call, test both branches

- **Required call**: the operation fails when the provider fails. Translate the port's
  error into a Nest/domain exception (`ServiceUnavailableException`, keep `cause`), and
  assert the type and the cause.
- **Best-effort call**: a delivery failure is logged and reported (a `false`, a flag on the
  row), never thrown. Assert it resolves, and that the failure was recorded.
- **Only the port's error is expected.** Anything else (a `TypeError`, a bug) propagates
  from both kinds of call; assert that too, or best-effort quietly swallows bugs.
- **Validate before calling.** Invalid input throws before the provider is reached:
  assert the exception **and** `not.toHaveBeenCalled()`.
- **No half-committed state.** A required call after a DB write either happens after
  commit or its failure rolls the write back; prove which in the integration spec by
  reading the rows back.
- **Assert nothing ran after the failure**: the next side effect (another port, an
  event) is `not.toHaveBeenCalled()`.

## Anti-patterns

- `jest.mock('@getbrevo/brevo')` (or `nock`) in a consumer spec: it tests past the adapter
  and pins the provider's payload in every consumer.
- Asserting on the value the mock was told to return, and calling it coverage.
- Snapshotting SDK payloads: assert the fields that matter with `toHaveBeenCalledWith`.
- "Integration" specs that call the provider's sandbox. They are slow, flaky and
  credentialed, and test the provider. If a contract check is really needed, it is a
  separate, manually-run job, never part of the suite.
- A consumer that catches `unknown` and treats every error as a delivery failure.

## Frontend and E2E

- A browser SDK (analytics, Stripe.js, maps, chat widgets) gets the same treatment: one
  frontend service or adapter wraps it, components use it through a hook, and component
  tests mock that service. See `frontend-vitest.md`.
- Playwright specs never reach a third party: `page.route` fulfils or aborts its hosts.
  `installApiCatchAll` (`templates/e2e/api-catch-all.ts`) takes any base URL, so call it
  once per provider host (`https://js.stripe.com`) next to the API one. A journey that needs a provider's UI (a hosted checkout) stubs the
  redirect back instead.
