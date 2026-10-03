# fullstack-standards

Reusable engineering guidelines, packaged as agent skills, for projects with this
architecture:

- **API:** any REST backend for the frontend rules — **NestJS or Strapi**; the frontend
  does not depend on which. The backend rules and the integration harness cover
  NestJS + PostgreSQL, Jest, with **any ORM**. TypeORM and Prisma are covered;
  the rules are ORM-neutral, and the ORM-specific parts (service template, test harness
  adapter, migration commands) sit in per-ORM folders. Supporting another ORM means
  adding one adapter folder (see `skills/fullstack-testing/references/api-integration.md`).
- **Frontend:** Vite + React SPA on a server-state library — **TanStack Query 5, SWR 2 or
  RTK Query**; the rules are library-neutral, with one adapter per library
  (`skills/data-layer/references/adapters/`). Vitest + React Testing Library
- **E2E:** Playwright
- A monorepo with a shared-types package (optional)

| Skill                                                          | Use it when                                                              |
| -------------------------------------------------------------- | ------------------------------------------------------------------------ |
| [`data-layer`](skills/data-layer) | Adding or changing server state with TanStack Query, SWR or RTK Query: the component → hook → frontend service → `apiClient.request` layering, cache keys, mutations and invalidation, backend services |
| [`fullstack-testing`](skills/fullstack-testing)                 | Writing or changing any test, on any layer (hooks only through components, services against the entry point, third-party services mocked at their adapter) |
| [`project-profile`](skills/project-profile)                     | Creating or refreshing a repo's profile block in `AGENTS.md`             |

## Install

```bash
# local, for every project on this machine (edits in this repo are live)
./install.sh               # symlinks into ~/.claude/skills and ~/.agents/skills
./install.sh --uninstall   # removes those links

# from a git remote, on another machine
npx skills add <git-url-of-this-repo>
```

### As a Claude Code plugin (skills + enforcement hooks)

```bash
claude plugin marketplace add ayhid/fullstack-standards
claude plugin install fullstack-standards@fullstack-standards
```

The plugin ships the same skills plus three hooks that enforce the architecture while
an agent works, from `scripts/architecture/check-architecture.mjs`:

| Hook | Does |
|---|---|
| `PreToolUse` on Write/Edit | **Denies** an edit whose result breaks a per-file rule: a component importing a service or the API client, a hook importing the client, `fetch`/`axios` outside the client, `renderHook` or a test file under `hooks/`, a third-party SDK imported outside its `*.adapter.ts` or mocked in a spec |
| `PostToolUse` on Write/Edit | Runs the project's `postCommands` (e.g. its linter) on the written file |
| `Stop` | For files changed in the working tree: re-checks every rule, and requires each changed component to have a test that renders it and each service a test that imports it. **Blocks finishing** until they exist; `stopCommands` (e.g. the guard specs) run too |

The hooks are inactive in a project without `.claude/fullstack-standards.json` (and
where `typescript@5` cannot be loaded). `project-profile` writes that file; see below.
Existing debt is recorded once as a **baseline** that tolerates it and can only shrink:

```bash
node <plugin>/scripts/architecture/check-architecture.mjs --all .       # audit
node <plugin>/scripts/architecture/check-architecture.mjs --baseline .  # record today's debt
```

### Strapi plugins

A Strapi v5 plugin is a frontend (`admin/src`) and a backend in one package. The detector
recognises one (`strapi.kind: "plugin"`, as a workspace or under a Strapi app's
`src/plugins/`) and writes two presets instead of a hand-made layout:

```json
{
  "frontends": [{ "root": "admin/src", "preset": "strapi-admin" }],
  "apis": [{ "root": ".", "preset": "strapi-plugin" }]
}
```

| Preset | Adds to the rules above |
|---|---|
| `strapi-admin` | Strapi's `getFetchClient()` is the API entry point (no wrapper file): only services call it, nothing calls `useFetchClient`; components never call `useQuery`/`useMutation` themselves |
| `strapi-plugin` | `server/src/domain/**` imports no `@strapi/*` and never touches `strapi`; unit tests (`tests/unit/**`) never import the integration harness or `@strapi/strapi`, never call `createStrapi`, never fake `strapi.documents`/`db`/`entityService`; SDKs only in `server/src/**/*.adapter.ts`; `dist/` and the fixture app are ignored |

A unit's own keys override its preset. The Strapi-specific rules for the rest of the
plugin live in [strapi-skills](https://github.com/ayhid/strapi-skills), which defers to
these skills for the admin data layer and its tests.

### In CI

The hooks only run while an agent works. Run the same checks on every push:

```bash
npx --yes github:ayhid/fullstack-standards#<tag> --all .
```

## Wire it into a project

The skills hold the **generic** rules. Everything specific to one project (paths,
commands, ORM, known debt) lives in that project's `AGENTS.md`, in a profile block
both skills read first and defer to. Generate it:

```bash
node skills/project-profile/scripts/detect-profile.mjs <repo>                 # preview
node skills/project-profile/scripts/detect-profile.mjs <repo> --write         # write it
node skills/project-profile/scripts/detect-profile.mjs <repo> --write-config  # the hooks' layout
```

or ask an agent to "create the project profile", which also verifies each detected
line and resolves the `TODO(verify)` fields. See
[`PROJECT-PROFILE.template.md`](PROJECT-PROFILE.template.md).

## Updating

A rule belongs here only if it held in at least one real project and is not about that
project's domain. When a project teaches you something new, generalise it (no entity
names, ticket ids, dates or people) before adding it.
